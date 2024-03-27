const mongoose = require('mongoose');
const express = require('express');
const app = express();
const port = 3000;

// Connect to MongoDB (replace 'mongodb_connection_string' with your actual connection string)
mongoose.connect('mongodb_connection_string');
const db = mongoose.connection;
db.on('error', console.error.bind(console, 'MongoDB connection error:'));

app.use(express.static('public'));
app.use(express.json());

const crypto = require('crypto');
const {
    ec: EC
} = require('elliptic');

async function sha256(message) {
    return new Promise((resolve, reject) => {
        try {
            const hash = crypto.createHash('sha256').update(message).digest('hex');
            resolve(hash);
        } catch (error) {
            reject(error);
        }
    });
}


const participantSchema = new mongoose.Schema({
    publicKey: String, // Ethereum address of the participant
    ecPublicKey: String, // Elliptic curve public key of the participant
    Xi: [String], // Xi value as an array of strings to store coordinates
    hashXiPki: String, // Hash of Xi and participant's public key
    zi: String, // Placeholder for storing zi in round 3
});

const roundSchema = new mongoose.Schema({
    initiator: {
        publicKey: String, // Ethereum address of the initiator
        ecPublicKey: String, // Elliptic curve public key of the initiator
        Xi: [String],
        hashXiPki: String,
        zi: String, // Placeholder for storing initiator's zi in round 3
    },
    participants: [participantSchema],
});

const transactionSchema = new mongoose.Schema({
    message: {
        transactionId: String,
        recipient: String,
        amount: String,
        currency: String,
        timestamp: String,
    },
    participantAddresses: [String], 
    initiatorAddress: String, // Ethereum address of the initiator, for convenience
    PK: String, // Concatenated public keys (ecPublicKeys)
    pkbar: [String], // Placeholder for storing aggregated public key
    Xbar: [String], // Placeholder for storing aggregated Xi
    c: String, // Challenge calculated from pkbar, Xbar, and the message
    zbar: String,
    round1: roundSchema,
    round1Complete: {
        type: Boolean,
        default: false
    },
    round2Complete: {
        type: Boolean,
        default: false
    },
    round3Complete: {
        type: Boolean,
        default: false
    },
});

const Transaction = mongoose.model('Transaction', transactionSchema);

app.post('/save', async (req, res) => {
    const {
        message,
        participantAddresses,
        initiatorAddress,
        PK, // This will initially be empty and updated later
        pkbar, // Initially empty, to be filled later
        Xbar, // Initially empty, to be filled later
        c,
        zbar,
        round1
    } = req.body;

    // Prepare participants with placeholders for ecPublicKey and zi
    const preparedParticipants = round1.participants.map(participant => ({
        ...participant,
        ecPublicKey: "", // Will be populated when participant submits their data
        zi: "" // Placeholder for future steps
    }));

    const newTransaction = new Transaction({
        message,
        participantAddresses,
        initiatorAddress,
        PK, 
        pkbar, // Placeholder array, to be filled later
        Xbar, // Placeholder array, to be filled later
        c,
        zbar,
        round1: {
            initiator: {
                ...round1.initiator,
                ecPublicKey: round1.initiator.ecPublicKey, 
                zi: "" // Placeholder for future steps
            },
            participants: preparedParticipants
        },
    });

    try {
        await newTransaction.save();
        res.status(200).json({
            message: 'Transaction saved successfully'
        });
    } catch (err) {
        console.error('Error saving transaction to database:', err);
        res.status(500).json({
            error: 'Error saving transaction',
            details: err.message
        });
    }
});

app.get('/api/transactions/:userAddress', async (req, res) => {
    try {
        const userAddress = req.params.userAddress;
        const transactions = await Transaction.find({
            $or: [{
                    initiatorAddress: userAddress
                },
                {
                    participantAddresses: userAddress
                }
            ]
        });
        res.json(transactions);
    } catch (err) {
        console.error('Error fetching transactions:', err);
        res.status(500).send('Error fetching transactions');
    }
});

app.post('/api/transactions/:transactionId/submitParticipantData', async (req, res) => {
    const {
        transactionId
    } = req.params;
    const {
        publicKey,
        ecPublicKey,
        Xi,
        hashXiPki
    } = req.body;
    try {
        const transaction = await Transaction.findById(transactionId);
        if (!transaction) {
            return res.status(404).json({
                message: 'Transaction not found'
            });
        }
        if (transaction.initiatorAddress === publicKey) {
            // Check if initiator's hashXiPki already exists to prevent updates
            if (transaction.round1.initiator.hashXiPki) {
                return res.status(403).json({
                    message: 'Initiator data has already been submitted and cannot be changed.'
                });
            }
            // Allow initiator to submit/update their data if hashXiPki not already submitted
            transaction.round1.initiator.Xi = Xi;
            transaction.round1.initiator.hashXiPki = hashXiPki;
            transaction.round1.initiator.ecPublicKey = ecPublicKey;
        } else {
            const participantIndex = transaction.round1.participants.findIndex(p => p.publicKey === publicKey);
            if (participantIndex > -1) {
                // Check if participant's hashXiPki already exists to prevent updates
                if (transaction.round1.participants[participantIndex].hashXiPki) {
                    return res.status(403).json({
                        message: 'Participant data has already been submitted and cannot be changed.'
                    });
                }
                // Update participant data
                transaction.round1.participants[participantIndex].Xi = Xi;
                transaction.round1.participants[participantIndex].hashXiPki = hashXiPki;
                transaction.round1.participants[participantIndex].ecPublicKey = ecPublicKey;
            } else {
                return res.status(404).json({
                    message: 'Participant not found in this transaction.'
                });
            }
        }
        // Check if all participants (and initiator, if applicable) have submitted their data
        const allDataSubmitted = transaction.round1.participants.every(participant => participant.hashXiPki) && transaction.round1.initiator.hashXiPki;
        if (allDataSubmitted) {
            // Mark Round 1 as complete if all required data has been submitted
            transaction.round1Complete = true;
            transaction.round2Complete = true;
            const PK = [transaction.round1.initiator.ecPublicKey, ...transaction.round1.participants.map(p => p.ecPublicKey)].join('');
            transaction.PK = PK;
        }

        await transaction.save();
        res.status(200).json({
            message: 'Data updated successfully',
            round1Complete: transaction.round1Complete
        });
    } catch (err) {
        console.error('Error updating data:', err);
        res.status(500).json({
            error: 'Error updating data',
            details: err.message
        });
    }
});

app.post('/api/transactions/:transactionId/validateXi', async (req, res) => {
    const {
        transactionId
    } = req.params;

    try {
        const transaction = await Transaction.findById(transactionId);
        if (!transaction) {
            return res.status(404).json({
                message: 'Transaction not found.'
            });
        }

        let allValid = true; // Flag to track validation status
        // Validate initiator's Xi
        const initiatorHash = await sha256(transaction.round1.initiator.Xi.join('') + transaction.round1.initiator.ecPublicKey);
        if (initiatorHash !== transaction.round1.initiator.hashXiPki) {
            allValid = false;
        }

        // Validate each participant's Xi
        for (let participant of transaction.round1.participants) {
            const participantHash = await sha256(participant.Xi.join('') + participant.ecPublicKey);
            if (participantHash !== participant.hashXiPki) {
                allValid = false;
                break; // Exit loop if any Xi is invalid
            }
        }

        if (allValid) {
            res.status(200).json({
                message: 'All Xi\'s are valid.'
            });
        } else {
            res.status(400).json({
                message: 'Validation failed. One or more Xi\'s are invalid.'
            });
        }
    } catch (err) {
        console.error('Error validating Xi\'s:', err);
        res.status(500).json({
            error: 'Error validating Xi\'s',
            details: err.message
        });
    }
});

// Fetch a single transaction by ID
app.get('/api/transactions/get/:transactionId', async (req, res) => {
    const {
        transactionId
    } = req.params;
    try {
        const transaction = await Transaction.findById(transactionId);
        if (!transaction) {
            return res.status(404).json({
                message: 'Transaction not found'
            });
        }
        res.json(transaction);
    } catch (err) {
        console.error('Error fetching transaction:', err);
        res.status(500).json({
            error: 'Error fetching transaction',
            details: err.message
        });
    }
});

// Update a transaction with pkbar and Xbar
app.post('/api/transactions/:transactionId/updatePkbarXbarC', async (req, res) => {
    const {
        transactionId
    } = req.params;
    const {
        pkbar,
        Xbar,
        c
    } = req.body;

    try {
        const transaction = await Transaction.findById(transactionId);
        if (!transaction) {
            return res.status(404).json({
                message: 'Transaction not found'
            });
        }

        if (transaction.pkbar && transaction.Xbar && transaction.c) {
            if (transaction.pkbar[0] === pkbar && transaction.Xbar[0] === Xbar && transaction.c === c) {
                res.status(200).json({
                    message: 'No update necessary. pkbar, Xbar, and challenge already match the provided values.'
                });
            } else {
                res.status(409).json({
                    message: 'Conflict detected. Provided pkbar, Xbar, or challenge values do not match existing values.'
                });
            }
        } else {
            transaction.pkbar = pkbar;
            transaction.Xbar = Xbar;
            transaction.c = c;
            await transaction.save();
            res.status(200).json({
                message: 'Transaction updated successfully with pkbar, Xbar, and challenge'
            });
        }

    } catch (err) {
        console.error('Error updating transaction:', err);
        res.status(500).json({
            error: 'Error updating transaction',
            details: err.message
        });
    }
});

app.post('/api/transactions/:transactionId/submitZi', async (req, res) => {
    const {
        transactionId
    } = req.params;
    const {
        ethereumAddress,
        zi
    } = req.body;

    try {
        const transaction = await Transaction.findById(transactionId);
        if (!transaction) {
            return res.status(404).json({
                message: 'Transaction not found.'
            });
        }

        // Determine if the request is from the initiator or a participant
        if (transaction.initiatorAddress === ethereumAddress) {
            // Check if zi already exists for the initiator
            if (transaction.round1.initiator.zi) {
                return res.status(409).json({
                    message: 'zi value already submitted for the initiator.'
                });
            } else {
                // Update zi for the initiator
                transaction.round1.initiator.zi = zi;
            }
        } else {
            // Find the participant and update zi
            const participant = transaction.round1.participants.find(p => p.publicKey === ethereumAddress);
            if (participant) {
                // Check if zi already exists for this participant
                if (participant.zi) {
                    return res.status(409).json({
                        message: `zi value already submitted for the participant with address ${ethereumAddress}.`
                    });
                } else {
                    // Update zi for the participant
                    participant.zi = zi;
                }
            } else {
                return res.status(404).json({
                    message: 'Participant not found in this transaction.'
                });
            }
        }

        const allZiSubmitted = transaction.round1.initiator.zi && transaction.round1.participants.every(p => p.zi);
        if (allZiSubmitted) {
            transaction.round3Complete = true;
        }

        await transaction.save();
        res.status(200).json({
            message: 'zi value submitted successfully.'
        });
    } catch (err) {
        console.error('Error submitting zi value:', err);
        res.status(500).json({
            error: 'Error submitting zi value',
            details: err.message
        });
    }
});

app.post('/api/transactions/:transactionId/calculateZbar', async (req, res) => {
    const {
        transactionId
    } = req.params;

    try {
        const transaction = await Transaction.findById(transactionId);
        if (!transaction) {
            return res.status(404).json({
                message: 'Transaction not found.'
            });
        }

        // Ensure all zi values have been submitted
        const allZiSubmitted = transaction.round1.initiator.zi &&
            transaction.round1.participants.every(p => p.zi);
        if (!allZiSubmitted) {
            return res.status(400).json({
                message: 'Not all zi values have been submitted.'
            });
        }

        const EC = require('elliptic').ec;
        const ec = new EC('secp256k1');
        const BN = require('bn.js');
        let zbar = new BN(0);
        const q = ec.curve.n;

        const allParticipants = [transaction.round1.initiator, ...transaction.round1.participants];
        for (const {
                ecPublicKey,
                zi
            } of allParticipants) {
            const hashInput = ecPublicKey + transaction.PK; // Concatenate ecPublicKey with PK
            const hash = await sha256(hashInput); // Calculate H(pki | PK)
            const weight = new BN(hash, 16); // Convert hash to a big number
            const weightedZi = new BN(zi, 16).mul(weight).mod(q); // Multiply zi by its weight and mod q
            zbar = zbar.add(weightedZi).mod(q); // Sum up all weighted zi values, mod q
        }

        // Update transaction with zbar, ensuring it's a hexadecimal string
        transaction.zbar = zbar.toString(16);
        transaction.round3Complete = true; // Mark round 3 as complete
        await transaction.save();

        res.status(200).json({
            message: 'zbar calculated and saved successfully.',
            zbar: transaction.zbar
        });
    } catch (err) {
        console.error('Error calculating zbar:', err);
        res.status(500).json({
            error: 'Error calculating zbar',
            details: err.message
        });
    }
});

app.get('/api/transactions/:transactionId/verifySignature', async (req, res) => {
    const {
        transactionId
    } = req.params;

    try {
        // Fetch the transaction by ID
        const transaction = await Transaction.findById(transactionId);
        if (!transaction) {
            return res.status(404).send({
                message: 'Transaction not found.'
            });
        }
        const BN = require('bn.js');
        // Initialize elliptic curve
        const ec = new EC('secp256k1');
        const G = ec.curve.g; // Base point

        // Deconstruct required values from the transaction
        const {
            PK,
            pkbar,
            Xbar,
            c,
            zbar,
            message
        } = transaction;
        const M = JSON.stringify(message); // Assumption: message is an object and needs to be stringified

        // Recalculate the challenge 'c' for verification
        const recalculatedC = await sha256(pkbar + Xbar + M);

        // Check if the recalculated 'c' matches the stored 'c'
        if (recalculatedC !== c) {
            return res.status(400).send({
                message: 'Verification failed. Challenge does not match.'
            });
        }

        // Prepare components for verification
        const zbarBN = new BN(zbar, 16); // Ensure zbar is a valid hex string representing a big number

        const sG = G.mul(zbarBN); // zbar * G
        const pkbarPoint = ec.keyFromPublic(pkbar[0], 'hex').getPublic();
        const XbarPoint = ec.keyFromPublic(Xbar[0], 'hex').getPublic();
        const cBN = new BN(c, 16);
        const cpkbar = pkbarPoint.mul(cBN);
        // Verify if sG equals Xbar + c * pkbar
        if (!sG.eq(XbarPoint.add(cpkbar))) {
            return res.status(400).json({
                verified: false,
                message: 'Signature verification failed.'
            });
        }
        return res.status(200).json({
            verified: true
        });
    } catch (error) {
        console.error('Error verifying signature:', error);
        res.status(500).send({
            error: 'Error verifying signature',
            details: error.message
        });
    }
});


app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});