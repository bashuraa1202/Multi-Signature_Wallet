// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.7.0 <0.9.0;

/* Mostly copied from the Gnosis Multi-Signature Wallet
Since we are mainly focused on reducing signature size and gas costs, this should be no problem
*/
contract MultiSig {
    /* Events */
    //Not sure we'll need these
    event Confirmation(address indexed sender, uint indexed transactionId);
    event Revocation(address indexed sender, uint indexed transactionId);
    event Submission(uint indexed transactionId);
    event Execution(uint indexed transactionId);
    event ExecutionFailure(uint indexed transactionId);
    event Deposit(address indexed sender, uint value);
    event RequirementChange(uint required);   

    struct Transaction {
        address destination;
        uint value;
        bytes data;
        bool executed;
        uint confirmations;
    }

    mapping (uint => Transaction) public transactions;
    mapping (address => bool) public isOwner;
    address[] public owners;
    uint public required;
    uint public transactionCount;

    /* Modifiers */
    modifier onlyWallet() {
        require(msg.sender == address(this));
        _;
    }

    modifier ownerDoesNotExist(address owner) {
        require(!isOwner[owner]);
        _;
    }

    modifier ownerExists(address owner) {
        require(isOwner[owner]);
        _;
    }

    modifier transactionExists(uint transactionId) {
        require(transactions[transactionId].destination != address(0));
        _;
    }

    modifier confirmed(uint transactionId, address owner) {
        require(transactions[transactionId].confirmations > 0);
        _;
    }

    modifier notConfirmed(uint transactionId, address owner) {
        require(transactions[transactionId].confirmations == 0);
        _;
    }

    modifier notExecuted(uint transactionId) {
        require(!transactions[transactionId].executed);
        _;
    }

    modifier notNull(address _address) {
        require(_address != address(0));
        _;
    }

    modifier validRequirement(uint ownerCount, uint _required) {
        require(_required <= owners.length
            && _required != 0
            && ownerCount != 0);
        _;
    }
    
    // funtion allows to deposit ether
    receive () external payable {
        if (msg.value > 0)
            emit Deposit(msg.sender, msg.value);
    }

    /* Contract constructor
        _owners List of initial owners
        _required Number of required confirmations
    */
    constructor (address[] memory _owners, uint _required)
        public
        validRequirement(_owners.length, _required)
    {
        for (uint i=0; i<_owners.length; i++) {
            require(!isOwner[_owners[i]] && _owners[i] != address(0));
            isOwner[_owners[i]] = true;
        }
        owners = _owners;
        required = _required;
    }

    function submitTransaction(address destination, uint value, bytes calldata data)
        public
        returns (uint transactionId)
    {
        transactionId = addTransaction(destination, value, data);
        confirmTransaction(transactionId);
    }

    // @dev Allows an owner to confirm a transaction.
    // @param transactionId Transaction ID.
    function confirmTransaction(uint transactionId)
        public
        ownerExists(msg.sender)
        transactionExists(transactionId)
        notConfirmed(transactionId, msg.sender)
    {
        transactions[transactionId].confirmations++;
        emit Confirmation(msg.sender, transactionId);
    }

    // @dev Allows an owner to revoke a confirmation for a transaction.
    // @param transactionId Transaction ID.
    function revokeConfirmation(uint transactionId)
        public
        ownerExists(msg.sender)
        confirmed(transactionId, msg.sender)
        notExecuted(transactionId)
    {
        transactions[transactionId].confirmations--;
        emit Revocation(msg.sender, transactionId);
    }

    // @dev Allows anyone to execute a confirmed transaction.
    // @param transactionId Transaction ID.
    function executeTransaction(uint transactionId)
        public
        ownerExists(msg.sender)
        confirmed(transactionId, msg.sender)
        notExecuted(transactionId)
    {
        if (isConfirmed(transactionId)) {
            Transaction storage txn = transactions[transactionId];
            txn.executed = true;
            (bool success, ) = txn.destination.call{value: txn.value}(txn.data);
            if (success)
                emit Execution(transactionId);
            else {
                emit ExecutionFailure(transactionId);
                txn.executed = false;
            }
        }
    }


    // @dev Returns the confirmation status of a transaction.
    // @param transactionId Transaction ID.
    // @return Confirmation status.
    function isConfirmed(uint transactionId)
        public
        view
        returns (bool)
    {
        return (transactions[transactionId].confirmations >= required);
    }

    
    // @dev Adds a new transaction to the transaction mapping, if transaction does not exist yet.
    // @param destination Transaction target address.
    // @param value Transaction ether value.
    // @param data Transaction data payload.
    // @return Returns transaction ID.
    function addTransaction(address destination, uint value, bytes calldata data)
        internal
        notNull(destination)
        returns (uint transactionId)
    {
        transactionId = transactionCount;
        transactions[transactionId] = Transaction({
            destination: destination,
            value: value,
            data: data,
            executed: false,
            confirmations: 0
        });
        transactionCount += 1;
        emit Submission(transactionId);
    }


}
