// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

/**
 * @title Stipend
 * @notice A spending allowance that refills.
 *
 * A guardian funds a pot for a beneficiary and sets a cap: up to X BOT per period.
 * The beneficiary can draw any amount up to the remaining cap whenever they like;
 * the cap refills in full at the start of every period (unused allowance does not roll over).
 * The guardian — or anyone — can top the pot up. The guardian can close the
 * allowance at any moment and take back whatever is left.
 *
 * What it deliberately cannot do:
 * - The guardian can close it at any time and reclaim the balance — a Stipend is controlled generosity, not a promise.
 * - Unused allowance disappears at the refill; it does not accumulate.
 * - The cap and period are fixed at creation; to change them, close and create another.
 * - The beneficiary address is fixed; if that wallet is lost, so is access.
 */
interface IStipendErrors {
    error Closed(uint256 id);
}

contract Stipend {
    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    uint64 public constant MIN_PERIOD = 1 hours;
    uint64 public constant MAX_PERIOD = 365 days;
    uint256 public constant MAX_LABEL_BYTES = 60;
    uint256 public constant MAX_PAGE = 50;

    // -------------------------------------------------------------------------
    // Structs
    // -------------------------------------------------------------------------

    struct Allowance {
        address guardian;       // 20 bytes ┐ slot 1
        uint64  period;         //  8 bytes │
        uint32  createdBlock;   //  4 bytes ┘
        address beneficiary;    // 20 bytes ┐ slot 2
        uint96  perPeriod;      // 12 bytes ┘
        uint96  balance;        // 12 bytes ┐ slot 3
        uint96  drawn;          // 12 bytes │  drawn within period `drawnPeriod`
        uint32  drawnPeriod;    //  4 bytes ┘
        uint64  startAt;        //  8 bytes ┐ slot 4
        bool    closed;         //  1 byte  ┘
    }

    struct StatusView {
        uint256 id;
        address guardian;
        address beneficiary;
        uint96  perPeriod;
        uint64  period;
        uint96  balance;
        uint64  startAt;
        bool    closed;
        uint32  createdBlock;
        uint96  allowanceLeft;
        uint96  spendable;
        uint64  nextRefillAt;
        uint32  periodIndex;
    }

    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    mapping(uint256 => Allowance) private _allowances;
    mapping(address => uint256[]) private _idsFor;
    uint256 public allowanceCount;

    uint256 private _lock = 1;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event Created(
        uint256 indexed id,
        address indexed guardian,
        address indexed beneficiary,
        uint96 perPeriod,
        uint64 period,
        string label
    );

    event ToppedUp(
        uint256 indexed id,
        address indexed from,
        uint96 amount,
        uint96 balance
    );

    event Drawn(
        uint256 indexed id,
        address indexed beneficiary,
        uint96 amount,
        uint96 allowanceLeft,
        uint96 balance
    );

    event Closed(
        uint256 indexed id,
        address indexed guardian,
        uint96 returned
    );

    // -------------------------------------------------------------------------
    // Custom Errors
    // -------------------------------------------------------------------------

    error BadParty();
    error ZeroAmount();
    error BadPeriod(uint64 period);
    error LabelTooLong(uint256 length, uint256 max);
    error AmountTooLarge();
    error NoSuchAllowance(uint256 id);
    error NotBeneficiary(uint256 id, address caller);
    error NotGuardian(uint256 id, address caller);
    error OverAllowance(uint256 available, uint256 requested);
    error InsufficientBalance(uint256 balance, uint256 requested);
    error TransferFailed();

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    modifier nonReentrant() {
        require(_lock == 1, "REENTRANT");
        _lock = 2;
        _;
        _lock = 1;
    }

    // -------------------------------------------------------------------------
    // Core Functions
    // -------------------------------------------------------------------------

    /**
     * @notice Create a new recurring stipend allowance.
     * @param beneficiary The address permitted to draw funds each period.
     * @param perPeriod Maximum amount of native BOT allowed to be drawn per period.
     * @param period Duration of each refill period in seconds.
     * @param label Purpose or description tag (up to 60 bytes, emitted in event).
     */
    function create(
        address beneficiary,
        uint96 perPeriod,
        uint64 period,
        string calldata label
    ) external payable returns (uint256 id) {
        if (beneficiary == address(0) || beneficiary == msg.sender) revert BadParty();
        if (perPeriod == 0) revert ZeroAmount();
        if (period < MIN_PERIOD || period > MAX_PERIOD) revert BadPeriod(period);
        if (bytes(label).length > MAX_LABEL_BYTES) {
            revert LabelTooLong(bytes(label).length, MAX_LABEL_BYTES);
        }
        if (msg.value > type(uint96).max) revert AmountTooLarge();

        uint96 initialDeposit = uint96(msg.value);

        id = ++allowanceCount;
        _allowances[id] = Allowance({
            guardian: msg.sender,
            period: period,
            createdBlock: uint32(block.number),
            beneficiary: beneficiary,
            perPeriod: perPeriod,
            balance: initialDeposit,
            drawn: 0,
            drawnPeriod: 0,
            startAt: uint64(block.timestamp),
            closed: false
        });

        _idsFor[msg.sender].push(id);
        _idsFor[beneficiary].push(id);

        emit Created(id, msg.sender, beneficiary, perPeriod, period, label);

        if (initialDeposit > 0) {
            emit ToppedUp(id, msg.sender, initialDeposit, initialDeposit);
        }
    }

    /**
     * @notice Deposit additional funds into an existing open stipend allowance.
     * @param id The allowance identifier.
     */
    function topUp(uint256 id) external payable {
        if (id == 0 || id > allowanceCount) revert NoSuchAllowance(id);
        Allowance storage a = _allowances[id];
        if (a.closed) revert IStipendErrors.Closed(id);
        if (msg.value == 0) revert ZeroAmount();
        if (uint256(a.balance) + msg.value > type(uint96).max) revert AmountTooLarge();

        uint96 amount = uint96(msg.value);
        a.balance += amount;

        emit ToppedUp(id, msg.sender, amount, a.balance);
    }

    /**
     * @notice Draw funds from the allowance up to the current period cap and pot balance.
     * @param id The allowance identifier.
     * @param amount The native BOT amount to withdraw.
     */
    function draw(uint256 id, uint96 amount) external nonReentrant {
        if (id == 0 || id > allowanceCount) revert NoSuchAllowance(id);
        Allowance storage a = _allowances[id];
        if (a.closed) revert IStipendErrors.Closed(id);
        if (msg.sender != a.beneficiary) revert NotBeneficiary(id, msg.sender);
        if (amount == 0) revert ZeroAmount();

        uint32 currentPeriod = uint32((block.timestamp - a.startAt) / a.period);

        // Roll to new period if crossed
        if (a.drawnPeriod != currentPeriod) {
            a.drawn = 0;
            a.drawnPeriod = currentPeriod;
        }

        uint96 available = a.perPeriod - a.drawn;
        if (amount > available) revert OverAllowance(available, amount);
        if (amount > a.balance) revert InsufficientBalance(a.balance, amount);

        // Effects before interaction
        a.drawn += amount;
        a.balance -= amount;

        uint96 remainingAllowance = a.perPeriod - a.drawn;
        uint96 remainingBalance = a.balance;

        emit Drawn(id, msg.sender, amount, remainingAllowance, remainingBalance);

        // Interaction
        (bool ok, ) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    /**
     * @notice Close the stipend allowance and refund the remaining pot balance to the guardian.
     * @param id The allowance identifier.
     */
    function close(uint256 id) external nonReentrant {
        if (id == 0 || id > allowanceCount) revert NoSuchAllowance(id);
        Allowance storage a = _allowances[id];
        if (a.closed) revert IStipendErrors.Closed(id);
        if (msg.sender != a.guardian) revert NotGuardian(id, msg.sender);

        a.closed = true;
        uint96 returned = a.balance;
        a.balance = 0;

        emit Closed(id, msg.sender, returned);

        if (returned > 0) {
            (bool ok, ) = msg.sender.call{value: returned}("");
            if (!ok) revert TransferFailed();
        }
    }

    // -------------------------------------------------------------------------
    // View Functions
    // -------------------------------------------------------------------------

    /**
     * @notice Query the detailed live status and metrics of a stipend allowance.
     * @param id The allowance identifier.
     */
    function status(uint256 id) external view returns (StatusView memory) {
        if (id == 0 || id > allowanceCount) revert NoSuchAllowance(id);
        Allowance storage a = _allowances[id];

        uint32 currentPeriod = uint32((block.timestamp - a.startAt) / a.period);
        uint96 drawnInPeriod = (a.drawnPeriod == currentPeriod) ? a.drawn : 0;

        uint96 allowanceLeft = a.closed ? 0 : (a.perPeriod - drawnInPeriod);
        uint96 spendable = a.closed ? 0 : (allowanceLeft < a.balance ? allowanceLeft : a.balance);
        uint64 nextRefillAt = a.startAt + (uint64(currentPeriod) + 1) * a.period;

        return StatusView({
            id: id,
            guardian: a.guardian,
            beneficiary: a.beneficiary,
            perPeriod: a.perPeriod,
            period: a.period,
            balance: a.balance,
            startAt: a.startAt,
            closed: a.closed,
            createdBlock: a.createdBlock,
            allowanceLeft: allowanceLeft,
            spendable: spendable,
            nextRefillAt: nextRefillAt,
            periodIndex: currentPeriod
        });
    }

    /**
     * @notice Paginated query of allowances associated with an address (as guardian or beneficiary).
     * @param who The address to query.
     * @param offset Start index from newest to oldest.
     * @param count Maximum items to return (clamped to MAX_PAGE).
     */
    function allowancesFor(
        address who,
        uint256 offset,
        uint256 count
    ) external view returns (StatusView[] memory) {
        uint256 total = _idsFor[who].length;
        if (offset >= total) {
            return new StatusView[](0);
        }

        if (count > MAX_PAGE) {
            count = MAX_PAGE;
        }

        uint256 end = offset + count;
        if (end > total) {
            end = total;
        }

        uint256 resultLen = end - offset;
        StatusView[] memory list = new StatusView[](resultLen);

        for (uint256 i = 0; i < resultLen; i++) {
            uint256 id = _idsFor[who][total - 1 - (offset + i)];
            list[i] = this.status(id);
        }

        return list;
    }
}
