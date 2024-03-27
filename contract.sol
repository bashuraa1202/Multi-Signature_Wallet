// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.2 <0.9.0; 

/**
 Need to use functions from schnorr.sol to verify pk
Can just copy/paste onto here, no need to import
 
 recieve pk as points
 */
contract MultiSig {
    //Comes from schnorr.sol. Will probably need to add more 
    uint256 public constant GX = 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798;
    uint256 public constant GY = 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8;
    
    uint public counter = 0;
    mapping (address => uint256) private accounts;
	
	receive () payable external{}

	/*
	PK probably won't be a uint
	*/
	function pay (address from, uint amount, address to, uint x, uint z, uint m, uint pk) public{
            if (verify(x, z, m, pk)){
                accounts[from] -= amount;
                payable(to).transfer(amount);
                accounts[to] += amount;
            }
		
    }
	
	function verify(uint x, uint z, bytes32 m, uint pk)private returns (bool t){
		
        bytes32 c = sha256(abi.encodePacked(from, x, m)); 

	
        //it accepts only if zG = c * address + x; Use functions from schnorr.sol
        uint256 v = uint256(c) * uint160(bytes20(from)) + x; //This is wrong
        
        if (success) { //change success to what is actually successful
            counter++;
            return true;
        }
        
        
        return false; 
	}
    
}
