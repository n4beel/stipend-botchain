// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Test, console2} from "forge-std/Test.sol";
import {Stipend, IStipendErrors} from "../src/Stipend.sol";

contract ReentrantBeneficiary {
    Stipend public stipend;
    uint256 public allowanceId;
    uint96 public drawAmount;
    bool public hasAttacked;

    constructor(address stipendAddress) {
        stipend = Stipend(stipendAddress);
    }

    function setTarget(uint256 id, uint96 amount) external {
        allowanceId = id;
        drawAmount = amount;
        hasAttacked = false;
    }

    receive() external payable {
        if (!hasAttacked) {
            hasAttacked = true;
            // Attempt to reenter draw
            stipend.draw(allowanceId, drawAmount);
        }
    }
}

contract ReentrantGuardian {
    Stipend public stipend;
    uint256 public allowanceId;
    bool public hasAttacked;

    constructor(address stipendAddress) {
        stipend = Stipend(stipendAddress);
    }

    function setTarget(uint256 id) external {
        allowanceId = id;
        hasAttacked = false;
    }

    receive() external payable {
        if (!hasAttacked) {
            hasAttacked = true;
            // Attempt to reenter close
            stipend.close(allowanceId);
        }
    }
}

contract ExplicitReentrantAttacker {
    Stipend public stipend;
    uint256 public allowanceId;
    bytes public capturedRevert;

    constructor(address stipendAddress) {
        stipend = Stipend(stipendAddress);
    }

    function setTarget(uint256 id) external {
        allowanceId = id;
    }

    receive() external payable {
        (bool ok, bytes memory data) = address(stipend).call(
            abi.encodeWithSelector(Stipend.draw.selector, allowanceId, 0.01 ether)
        );
        if (!ok) {
            capturedRevert = data;
        }
    }
}

contract StipendTest is Test {
    Stipend public stipend;

    address public guardian = address(0x1111);
    address public beneficiary = address(0x2222);
    address public stranger = address(0x3333);

    uint96 public constant PER_PERIOD = 0.2 ether;
    uint64 public constant PERIOD = 7 days;
    uint96 public constant INITIAL_POT = 1.0 ether;

    function setUp() public {
        vm.warp(1_760_000_000); // stable baseline timestamp
        stipend = new Stipend();

        vm.deal(guardian, 100 ether);
        vm.deal(beneficiary, 10 ether);
        vm.deal(stranger, 100 ether);
    }

    // -------------------------------------------------------------------------
    // Create Tests
    // -------------------------------------------------------------------------

    function test_Create_StoresAndFunds() public {
        vm.startPrank(guardian);
        uint256 id = stipend.create{value: INITIAL_POT}(
            beneficiary,
            PER_PERIOD,
            PERIOD,
            "Weekly allowance"
        );
        vm.stopPrank();

        assertEq(id, 1);
        assertEq(stipend.allowanceCount(), 1);

        Stipend.StatusView memory s = stipend.status(id);
        assertEq(s.guardian, guardian);
        assertEq(s.beneficiary, beneficiary);
        assertEq(s.perPeriod, PER_PERIOD);
        assertEq(s.period, PERIOD);
        assertEq(s.balance, INITIAL_POT);
        assertEq(s.startAt, uint64(block.timestamp));
        assertFalse(s.closed);
        assertEq(s.allowanceLeft, PER_PERIOD);
        assertEq(s.spendable, PER_PERIOD); // min(PER_PERIOD, INITIAL_POT)
        assertEq(s.nextRefillAt, uint64(block.timestamp) + PERIOD);
        assertEq(s.periodIndex, 0);
    }

    function test_Create_Rejects_Self_Zero_BadPeriod_LongLabel() public {
        vm.startPrank(guardian);

        // beneficiary == address(0)
        vm.expectRevert(Stipend.BadParty.selector);
        stipend.create(address(0), PER_PERIOD, PERIOD, "test");

        // beneficiary == msg.sender
        vm.expectRevert(Stipend.BadParty.selector);
        stipend.create(guardian, PER_PERIOD, PERIOD, "test");

        // perPeriod == 0
        vm.expectRevert(Stipend.ZeroAmount.selector);
        stipend.create(beneficiary, 0, PERIOD, "test");

        // period < MIN_PERIOD (1 hour)
        vm.expectRevert(abi.encodeWithSelector(Stipend.BadPeriod.selector, uint64(30 minutes)));
        stipend.create(beneficiary, PER_PERIOD, 30 minutes, "test");

        // period > MAX_PERIOD (365 days)
        vm.expectRevert(abi.encodeWithSelector(Stipend.BadPeriod.selector, uint64(366 days)));
        stipend.create(beneficiary, PER_PERIOD, 366 days, "test");

        // label > 60 bytes
        string memory longLabel = "1234567890123456789012345678901234567890123456789012345678901"; // 61 bytes
        vm.expectRevert(abi.encodeWithSelector(Stipend.LabelTooLong.selector, uint256(61), uint256(60)));
        stipend.create(beneficiary, PER_PERIOD, PERIOD, longLabel);

        vm.stopPrank();
    }

    // -------------------------------------------------------------------------
    // TopUp Tests
    // -------------------------------------------------------------------------

    function test_TopUp_Anyone() public {
        vm.prank(guardian);
        uint256 id = stipend.create{value: 0.5 ether}(
            beneficiary,
            PER_PERIOD,
            PERIOD,
            "pot"
        );

        // Stranger tops up
        vm.prank(stranger);
        stipend.topUp{value: 0.3 ether}(id);

        Stipend.StatusView memory s = stipend.status(id);
        assertEq(s.balance, 0.8 ether);
    }

    function test_TopUp_Closed() public {
        vm.prank(guardian);
        uint256 id = stipend.create{value: 0.5 ether}(
            beneficiary,
            PER_PERIOD,
            PERIOD,
            "pot"
        );

        vm.prank(guardian);
        stipend.close(id);

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(IStipendErrors.Closed.selector, id));
        stipend.topUp{value: 0.1 ether}(id);
    }

    // -------------------------------------------------------------------------
    // Draw Tests
    // -------------------------------------------------------------------------

    function test_Draw_WithinCap_Pays() public {
        vm.prank(guardian);
        uint256 id = stipend.create{value: 1 ether}(
            beneficiary,
            PER_PERIOD,
            PERIOD,
            "pot"
        );

        uint256 bBalBefore = beneficiary.balance;

        vm.prank(beneficiary);
        stipend.draw(id, 0.05 ether);

        assertEq(beneficiary.balance, bBalBefore + 0.05 ether);

        Stipend.StatusView memory s = stipend.status(id);
        assertEq(s.balance, 0.95 ether);
        assertEq(s.allowanceLeft, 0.15 ether);
        assertEq(s.spendable, 0.15 ether);

        // Draw remaining in this period
        vm.prank(beneficiary);
        stipend.draw(id, 0.15 ether);

        s = stipend.status(id);
        assertEq(s.balance, 0.8 ether);
        assertEq(s.allowanceLeft, 0);
        assertEq(s.spendable, 0);
    }

    function test_Draw_OverAllowance_Args() public {
        vm.prank(guardian);
        uint256 id = stipend.create{value: 1 ether}(
            beneficiary,
            PER_PERIOD,
            PERIOD,
            "pot"
        );

        // Try to draw 0.25 ether when cap is 0.20 ether
        vm.prank(beneficiary);
        vm.expectRevert(
            abi.encodeWithSelector(
                Stipend.OverAllowance.selector,
                PER_PERIOD,
                uint96(0.25 ether)
            )
        );
        stipend.draw(id, 0.25 ether);
    }

    function test_Draw_InsufficientBalance_Args() public {
        vm.prank(guardian);
        uint256 id = stipend.create{value: 0.05 ether}(
            beneficiary,
            PER_PERIOD, // 0.20 ether cap
            PERIOD,
            "pot"
        );

        // Allowance is 0.2 ether, but pot balance is only 0.05 ether
        vm.prank(beneficiary);
        vm.expectRevert(
            abi.encodeWithSelector(
                Stipend.InsufficientBalance.selector,
                uint96(0.05 ether),
                uint96(0.1 ether)
            )
        );
        stipend.draw(id, 0.1 ether);
    }

    function test_Draw_NotBeneficiary() public {
        vm.prank(guardian);
        uint256 id = stipend.create{value: 1 ether}(
            beneficiary,
            PER_PERIOD,
            PERIOD,
            "pot"
        );

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Stipend.NotBeneficiary.selector, id, stranger));
        stipend.draw(id, 0.05 ether);
    }

    function test_Draw_RollsPeriod_RefillsCap() public {
        vm.prank(guardian);
        uint256 id = stipend.create{value: 1 ether}(
            beneficiary,
            PER_PERIOD,
            PERIOD,
            "pot"
        );

        // Exhaust cap in period 0
        vm.prank(beneficiary);
        stipend.draw(id, PER_PERIOD);

        Stipend.StatusView memory s = stipend.status(id);
        assertEq(s.allowanceLeft, 0);

        // Warp to period 1
        vm.warp(block.timestamp + PERIOD + 1);

        s = stipend.status(id);
        assertEq(s.periodIndex, 1);
        assertEq(s.allowanceLeft, PER_PERIOD);
        assertEq(s.spendable, PER_PERIOD);

        // Can draw again in period 1
        vm.prank(beneficiary);
        stipend.draw(id, 0.1 ether);

        s = stipend.status(id);
        assertEq(s.allowanceLeft, 0.1 ether);
        assertEq(s.balance, 1 ether - PER_PERIOD - 0.1 ether);
    }

    function test_Draw_UnusedDoesNotRollOver() public {
        vm.prank(guardian);
        uint256 id = stipend.create{value: 1 ether}(
            beneficiary,
            PER_PERIOD,
            PERIOD,
            "pot"
        );

        // Draw only 0.05 ether in period 0 (leaving 0.15 ether unused)
        vm.prank(beneficiary);
        stipend.draw(id, 0.05 ether);

        // Warp to period 1
        vm.warp(block.timestamp + PERIOD);

        // Status shows refilled to exact PER_PERIOD (0.2 ether), NOT 0.35 ether
        Stipend.StatusView memory s = stipend.status(id);
        assertEq(s.allowanceLeft, PER_PERIOD);

        // Drawing more than PER_PERIOD reverts
        vm.prank(beneficiary);
        vm.expectRevert(
            abi.encodeWithSelector(
                Stipend.OverAllowance.selector,
                PER_PERIOD,
                uint96(0.25 ether)
            )
        );
        stipend.draw(id, 0.25 ether);
    }

    function test_Draw_SkippingSeveralPeriods() public {
        vm.prank(guardian);
        uint256 id = stipend.create{value: 2 ether}(
            beneficiary,
            PER_PERIOD,
            PERIOD,
            "pot"
        );

        // Warp 5 periods ahead without drawing
        vm.warp(block.timestamp + 5 * PERIOD + 100);

        Stipend.StatusView memory s = stipend.status(id);
        assertEq(s.periodIndex, 5);
        assertEq(s.allowanceLeft, PER_PERIOD);

        // Still can only draw up to PER_PERIOD
        vm.prank(beneficiary);
        stipend.draw(id, PER_PERIOD);

        s = stipend.status(id);
        assertEq(s.allowanceLeft, 0);
    }

    function test_Draw_AtPeriodBoundary() public {
        vm.prank(guardian);
        uint256 id = stipend.create{value: 2 ether}(
            beneficiary,
            PER_PERIOD,
            PERIOD,
            "pot"
        );

        uint64 start = uint64(block.timestamp);

        // At exactly start + PERIOD - 1: still period 0
        vm.warp(start + PERIOD - 1);
        vm.prank(beneficiary);
        stipend.draw(id, PER_PERIOD);

        // At exactly start + PERIOD: period 1 begins immediately!
        vm.warp(start + PERIOD);
        Stipend.StatusView memory s = stipend.status(id);
        assertEq(s.periodIndex, 1);
        assertEq(s.allowanceLeft, PER_PERIOD);

        // Draw in period 1 immediately
        vm.prank(beneficiary);
        stipend.draw(id, PER_PERIOD);
        assertEq(stipend.status(id).allowanceLeft, 0);
    }

    // -------------------------------------------------------------------------
    // Close Tests
    // -------------------------------------------------------------------------

    function test_Close_ReturnsBalance_GuardianOnly_Once() public {
        vm.prank(guardian);
        uint256 id = stipend.create{value: 1 ether}(
            beneficiary,
            PER_PERIOD,
            PERIOD,
            "pot"
        );

        // Beneficiary draws 0.1 ether
        vm.prank(beneficiary);
        stipend.draw(id, 0.1 ether);

        // Stranger cannot close
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Stipend.NotGuardian.selector, id, stranger));
        stipend.close(id);

        uint256 gBalBefore = guardian.balance;

        // Guardian closes
        vm.prank(guardian);
        stipend.close(id);

        assertEq(guardian.balance, gBalBefore + 0.9 ether);

        Stipend.StatusView memory s = stipend.status(id);
        assertTrue(s.closed);
        assertEq(s.balance, 0);
        assertEq(s.allowanceLeft, 0);
        assertEq(s.spendable, 0);

        // Closing twice reverts Closed
        vm.prank(guardian);
        vm.expectRevert(abi.encodeWithSelector(IStipendErrors.Closed.selector, id));
        stipend.close(id);
    }

    function test_Draw_AfterClose() public {
        vm.prank(guardian);
        uint256 id = stipend.create{value: 1 ether}(
            beneficiary,
            PER_PERIOD,
            PERIOD,
            "pot"
        );

        vm.prank(guardian);
        stipend.close(id);

        vm.prank(beneficiary);
        vm.expectRevert(abi.encodeWithSelector(IStipendErrors.Closed.selector, id));
        stipend.draw(id, 0.05 ether);
    }

    // -------------------------------------------------------------------------
    // Status and AllowancesFor Tests
    // -------------------------------------------------------------------------

    function test_Status_AllFields_BeforeAndAfterRefill() public {
        uint64 start = uint64(block.timestamp);
        vm.prank(guardian);
        uint256 id = stipend.create{value: 0.5 ether}(
            beneficiary,
            PER_PERIOD,
            PERIOD,
            "Label test"
        );

        Stipend.StatusView memory s0 = stipend.status(id);
        assertEq(s0.id, id);
        assertEq(s0.guardian, guardian);
        assertEq(s0.beneficiary, beneficiary);
        assertEq(s0.perPeriod, PER_PERIOD);
        assertEq(s0.period, PERIOD);
        assertEq(s0.balance, 0.5 ether);
        assertEq(s0.startAt, start);
        assertFalse(s0.closed);
        assertEq(s0.allowanceLeft, PER_PERIOD);
        assertEq(s0.spendable, PER_PERIOD);
        assertEq(s0.nextRefillAt, start + PERIOD);
        assertEq(s0.periodIndex, 0);

        // Draw 0.15 ether
        vm.prank(beneficiary);
        stipend.draw(id, 0.15 ether);

        Stipend.StatusView memory s1 = stipend.status(id);
        assertEq(s1.allowanceLeft, 0.05 ether);
        assertEq(s1.spendable, 0.05 ether);
        assertEq(s1.balance, 0.35 ether);

        // Warp past refill
        vm.warp(start + PERIOD + 3600);
        Stipend.StatusView memory s2 = stipend.status(id);
        assertEq(s2.periodIndex, 1);
        assertEq(s2.allowanceLeft, PER_PERIOD);
        assertEq(s2.spendable, PER_PERIOD); // 0.20 ether <= 0.35 ether
        assertEq(s2.nextRefillAt, start + 2 * PERIOD);
    }

    function test_AllowancesFor_BothRoles() public {
        // Guardian creates allowance 1 for beneficiary
        vm.prank(guardian);
        uint256 id1 = stipend.create{value: 0.1 ether}(beneficiary, 0.05 ether, 1 days, "one");

        // Stranger creates allowance 2 for guardian (guardian is beneficiary)
        vm.prank(stranger);
        uint256 id2 = stipend.create{value: 0.2 ether}(guardian, 0.1 ether, 1 days, "two");

        // Query allowances for guardian
        Stipend.StatusView[] memory gList = stipend.allowancesFor(guardian, 0, 10);
        assertEq(gList.length, 2);
        // Newest first
        assertEq(gList[0].id, id2);
        assertEq(gList[1].id, id1);

        // Query allowances for beneficiary
        Stipend.StatusView[] memory bList = stipend.allowancesFor(beneficiary, 0, 10);
        assertEq(bList.length, 1);
        assertEq(bList[0].id, id1);

        // Pagination offset
        Stipend.StatusView[] memory paged = stipend.allowancesFor(guardian, 1, 1);
        assertEq(paged.length, 1);
        assertEq(paged[0].id, id1);
    }

    // -------------------------------------------------------------------------
    // Reentrancy Tests
    // -------------------------------------------------------------------------

    function test_ReentrantBeneficiary() public {
        ReentrantBeneficiary attacker = new ReentrantBeneficiary(address(stipend));

        vm.prank(guardian);
        uint256 id = stipend.create{value: 1 ether}(
            address(attacker),
            PER_PERIOD,
            PERIOD,
            "pot"
        );

        attacker.setTarget(id, 0.05 ether);

        // Calling draw should trigger receive() reentrancy attempt and revert
        vm.prank(address(attacker));
        vm.expectRevert(Stipend.TransferFailed.selector);
        stipend.draw(id, 0.05 ether);
    }

    function test_ReentrantGuardian() public {
        ReentrantGuardian attacker = new ReentrantGuardian(address(stipend));
        vm.deal(address(attacker), 10 ether);

        vm.prank(address(attacker));
        uint256 id = stipend.create{value: 1 ether}(
            beneficiary,
            PER_PERIOD,
            PERIOD,
            "pot"
        );

        attacker.setTarget(id);

        vm.prank(address(attacker));
        vm.expectRevert(Stipend.TransferFailed.selector);
        stipend.close(id);
    }

    function test_ReentrancyCustomError() public {
        ExplicitReentrantAttacker attacker = new ExplicitReentrantAttacker(address(stipend));
        vm.prank(guardian);
        uint256 id = stipend.create{value: 1 ether}(
            address(attacker),
            PER_PERIOD,
            PERIOD,
            "pot"
        );
        attacker.setTarget(id);

        vm.prank(address(attacker));
        stipend.draw(id, 0.05 ether);

        assertEq(attacker.capturedRevert(), abi.encodeWithSelector(Stipend.Reentrancy.selector));
    }

    // -------------------------------------------------------------------------
    // Invariants & Gas Ceilings
    // -------------------------------------------------------------------------

    function invariant_BalanceEqualsOpen() public view {
        // Total contract balance must equal the sum of non-closed allowance balances
        uint256 count = stipend.allowanceCount();
        uint256 expectedSum = 0;
        for (uint256 i = 1; i <= count; i++) {
            Stipend.StatusView memory s = stipend.status(i);
            if (!s.closed) {
                expectedSum += s.balance;
            }
        }
        assertEq(address(stipend).balance, expectedSum);
    }

    function testFuzz_NeverExceedsCapPerPeriod(
        uint96 draw1,
        uint96 draw2,
        uint32 warpSeconds
    ) public {
        vm.assume(draw1 > 0 && draw1 <= PER_PERIOD);
        vm.assume(draw2 > 0 && draw2 <= PER_PERIOD);
        vm.assume(warpSeconds < PERIOD);

        vm.prank(guardian);
        uint256 id = stipend.create{value: 10 ether}(
            beneficiary,
            PER_PERIOD,
            PERIOD,
            "fuzz"
        );

        vm.prank(beneficiary);
        stipend.draw(id, draw1);

        // Warp within the same period
        vm.warp(block.timestamp + warpSeconds);

        uint96 available = PER_PERIOD - draw1;
        if (draw2 <= available) {
            vm.prank(beneficiary);
            stipend.draw(id, draw2);
            assertLe(draw1 + draw2, PER_PERIOD);
        } else {
            vm.prank(beneficiary);
            vm.expectRevert(
                abi.encodeWithSelector(
                    Stipend.OverAllowance.selector,
                    available,
                    draw2
                )
            );
            stipend.draw(id, draw2);
        }
    }

    function test_GasCeilings() public {
        vm.prank(guardian);
        uint256 gStart = gasleft();
        uint256 id = stipend.create{value: 1 ether}(
            beneficiary,
            PER_PERIOD,
            PERIOD,
            "gas check"
        );
        uint256 gCreate = gStart - gasleft();
        console2.log("gas create:", gCreate);
        assertLt(gCreate, 230_000);

        vm.prank(beneficiary);
        gStart = gasleft();
        stipend.draw(id, 0.05 ether);
        uint256 gDraw = gStart - gasleft();
        console2.log("gas draw:", gDraw);
        assertLt(gDraw, 90_000);

        vm.prank(guardian);
        gStart = gasleft();
        stipend.close(id);
        uint256 gClose = gStart - gasleft();
        console2.log("gas close:", gClose);
        assertLt(gClose, 80_000);
    }
}
