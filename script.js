console.log('Script loaded and executed!');
document.addEventListener("DOMContentLoaded", async function () {
    const navLinks = document.querySelector('.nav-links');
    const hamburgerMenu = document.querySelector('.hamburger-menu');
    const createTransactionButton = document.getElementById('createTransactionButton');
    const submitTransactionButton = document.getElementById('submitTransaction');
    const recipientAddressInput = document.getElementById('recipientAddress');
    const ethAmountInput = document.getElementById('ethAmount');
    const numPeopleSelect = document.getElementById('numPeople');

    let provider;
    let publicAddress;

    // Toggle mobile menu on hamburger click
    hamburgerMenu.addEventListener('click', function () {
        navLinks.classList.toggle('show');
    });

    // Hide mobile menu when a link is clicked
    navLinks.addEventListener('click', function () {
        navLinks.classList.remove('show');
    });

    // Check if MetaMask is installed and connected
    if (window.ethereum) {
        provider = new ethers.providers.Web3Provider(window.ethereum);

        try {
            // Request account access
            await window.ethereum.request({
                method: 'eth_requestAccounts'
            });
        } catch (error) {
            console.error('User denied account access:', error);
        }
    } else {
        console.error('MetaMask is not installed.');
        return;
    }

    const publicAddressElement = document.getElementById('publicAddress');
    const currentBalanceElement = document.getElementById('currentBalance');
    const transactionsElement = document.getElementById('transactions');
    const loadMoreButton = document.getElementById('loadMore');

    let currentPage = 1;
    const transactionsPerPage = 5;

    // Function to get the current balance of the Ethereum address
    async function getCurrentBalance() {
        try {
            const accounts = await provider.listAccounts();
            if (accounts.length > 0) {
                publicAddress = accounts[0];
                publicAddressElement.textContent = publicAddress;

                const balance = await provider.getBalance(publicAddress);
                const formattedBalance = ethers.utils.formatEther(balance);
                currentBalanceElement.textContent = `${formattedBalance} ETH`;

                // Load initial transactions
                loadTransactions();
            } else {
                console.error('No accounts found.');
            }
        } catch (error) {
            console.error('Error getting current balance:', error);
        }
    }

    // Function to load transactions for the given address and page
    async function loadTransactions() {
        try {
            const accounts = await provider.listAccounts();
            if (accounts.length > 0) {
                const publicAddress = accounts[0];
                const history = await provider.getHistory(publicAddress, {
                    page: currentPage,
                    offset: (currentPage - 1) * transactionsPerPage,
                    limit: transactionsPerPage,
                });

                history.forEach(transaction => {
                    const listItem = document.createElement('li');
                    listItem.textContent = `Transaction: ${transaction.hash}`;
                    transactionsElement.appendChild(listItem);
                });

                // If the number of transactions loaded is less than the requested per page,
                // it means there are no more transactions to load, so disable the button
                if (history.length < transactionsPerPage) {
                    loadMoreButton.disabled = true;
                }
            }
        } catch (error) {
            console.error('Error loading transactions:', error);
        }
    }

    // Event listener for the "Load More Transactions" button
    if (loadMoreButton) {
        loadMoreButton.addEventListener('click', () => {
            currentPage++;
            loadTransactions();
        });
    }

    // Update current address and available ETH display
    getCurrentBalance();

    // Check if the buttons exist before adding event listeners
    if (createTransactionButton) {
        createTransactionButton.addEventListener('click', () => {
            console.log('Create Transaction button clicked!');
            window.location.href = './create-transaction.html';
        });
    }

    if (submitTransactionButton) {
        submitTransactionButton.addEventListener('click', async () => {
            const recipientAddress = recipientAddressInput.value;
            const ethAmount = ethAmountInput.value;
            const numPeople = numPeopleSelect.value;

            const balance = await provider.getBalance(publicAddress);
            if (parseFloat(ethAmount) > parseFloat(ethers.utils.formatEther(balance))) {
                alert("Insufficient funds. Please enter a valid ETH amount.");
                return;
            }

            alert(`Transaction Details:\nRecipient Address: ${recipientAddress}\nETH Amount: ${ethAmount}\nNumber of People: ${numPeople}`);
        });
    }
    // getCurrentBalance();
});
