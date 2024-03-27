// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.8.2 <0.9.0; 

/**
 * @title Storage
 * @dev Store & retrieve value in a variable
 * @custom:dev-run-script ./scripts/deploy_with_ethers.ts
 
 recieve pk as points
 */
library EllipticCurve {

  function toAffine(uint256 _x, uint256 _y, uint256 _z, uint256 _pp) internal pure returns (uint256, uint256) {
    uint256 zInv = invMod(_z, _pp);
    uint256 zInv2 = mulmod(zInv, zInv, _pp);
    uint256 x2 = mulmod(_x, zInv2, _pp);
    uint256 y2 = mulmod(_y, mulmod(zInv, zInv2, _pp), _pp);

    return (x2, y2);
  }
  
  function invMod(uint256 _x, uint256 _pp) internal pure returns (uint256) {
    require(_x != 0 && _x != _pp && _pp != 0, "Invalid number");
    uint256 q = 0;
    uint256 newT = 1;
    uint256 r = _pp;
    uint256 t;
    while (_x != 0) {
      t = r / _x;
      (q, newT) = (newT, addmod(q, (_pp - mulmod(t, newT, _pp)), _pp));
      (r, _x) = (_x, r - t * _x);
    }

    return q;
  }

 function ecAdd(uint256 _x1, uint256 _y1, uint256 _x2, uint256 _y2, uint256 _aa, uint256 _pp) internal pure returns(uint256, uint256) {
    uint x = 0;
    uint y = 0;
    uint z = 0;

    // Double if x1==x2 else add
    if (_x1==_x2) {
      // y1 = -y2 mod p
      if (addmod(_y1, _y2, _pp) == 0) {
        return(0, 0);
      } else {
        // P1 = P2
        (x, y, z) = jacDouble(_x1, _y1, 1, _aa, _pp);
      }
    } else {
      (x, y, z) = jacAdd(_x1, _y1, 1, _x2, _y2, 1, _pp);
    }
    // Get back to affine
    return toAffine(x, y, z, _pp);
  }

  function ecSub(uint256 _x1, uint256 _y1, uint256 _x2, uint256 _y2, uint256 _aa, uint256 _pp) internal pure returns(uint256, uint256) {
    // invert square
    (uint256 x, uint256 y) = ecInv(_x2, _y2, _pp);
    // P1-square
    return ecAdd(_x1, _y1, x, y, _aa, _pp);
    
      function jacAdd(uint256 _x1, uint256 _y1, uint256 _z1, uint256 _x2, uint256 _y2, uint256 _z2, uint256 _pp) internal pure returns (uint256, uint256, uint256) {
    if (_x1==0 && _y1==0)
      return (_x2, _y2, _z2);
    if (_x2==0 && _y2==0)
      return (_x1, _y1, _z1);

    // We follow the equations described in https://pdfs.semanticscholar.org/5c64/29952e08025a9649c2b0ba32518e9a7fb5c2.pdf Section 5
    uint[4] memory zs; // z1^2, z1^3, z2^2, z2^3
    zs[0] = mulmod(_z1, _z1, _pp);
    zs[1] = mulmod(_z1, zs[0], _pp);
    zs[2] = mulmod(_z2, _z2, _pp);
    zs[3] = mulmod(_z2, zs[2], _pp);

    // u1, s1, u2, s2
    zs = [
      mulmod(_x1, zs[2], _pp),
      mulmod(_y1, zs[3], _pp),
      mulmod(_x2, zs[0], _pp),
      mulmod(_y2, zs[1], _pp)
    ];

    // In case of zs[0] == zs[2] && zs[1] == zs[3], double function should be used
    require(zs[0] != zs[2] || zs[1] != zs[3], "Use jacDouble function instead");

    uint[4] memory hr;
    //h
    hr[0] = addmod(zs[2], _pp - zs[0], _pp);
    //r
    hr[1] = addmod(zs[3], _pp - zs[1], _pp);
    //h^2
    hr[2] = mulmod(hr[0], hr[0], _pp);
    // h^3
    hr[3] = mulmod(hr[2], hr[0], _pp);
    // qx = -h^3  -2u1h^2+r^2
    uint256 qx = addmod(mulmod(hr[1], hr[1], _pp), _pp - hr[3], _pp);
    qx = addmod(qx, _pp - mulmod(2, mulmod(zs[0], hr[2], _pp), _pp), _pp);
    // qy = -s1*z1*h^3+r(u1*h^2 -x^3)
    uint256 qy = mulmod(hr[1], addmod(mulmod(zs[0], hr[2], _pp), _pp - qx, _pp), _pp);
    qy = addmod(qy, _pp - mulmod(zs[1], hr[3], _pp), _pp);
    // qz = h*z1*z2
    uint256 qz = mulmod(hr[0], mulmod(_z1, _z2, _pp), _pp);
    return(qx, qy, qz);
  }
, uint256 _z, uint256 _aa, uint256 _pp) internal pure returns (uint256, uint256, uint256) {
    if (_z == 0)
      return (_x, _y, _z);

    // We follow the equations described in https://pdfs.semanticscholar.org/5c64/29952e08025a9649c2b0ba32518e9a7fb5c2.pdf Section 5
    // Note: there is a bug in the paper regarding the m parameter, M=3*(x1^2)+a*(z1^4)
    // x, y, z at this point represent the squares of _x, _y, _z
    uint256 x = mulmod(_x, _x, _pp); //x1^2
    uint256 y = mulmod(_y, _y, _pp); //y1^2
    uint256 z = mulmod(_z, _z, _pp); //z1^2

    // s
    uint s = mulmod(4, mulmod(_x, y, _pp), _pp);
    // m
    uint m = addmod(mulmod(3, x, _pp), mulmod(_aa, mulmod(z, z, _pp), _pp), _pp);

    // x, y, z at this point will be reassigned and rather represent qx, qy, qz from the paper
    // This allows to reduce the gas cost and stack footprint of the algorithm
    // qx
    x = addmod(mulmod(m, m, _pp), _pp - addmod(s, s, _pp), _pp);
    // qy = -8*y1^4 + M(S-T)
    y = addmod(mulmod(m, addmod(s, _pp - x, _pp), _pp), _pp - mulmod(8, mulmod(y, y, _pp), _pp), _pp);
    // qz = 2*y1*z1
    z = mulmod(2, mulmod(_y, _z, _pp), _pp);

    return (x, y, z);
  }

  function jacMul(uint256 _d, uint256 _x, uint256 _y, uint256 _z, uint256 _aa, uint256 _pp) internal pure returns (uint256, uint256, uint256) {
    // Early return in case that `_d == 0`
    if (_d == 0) {
      return (_x, _y, _z);
    }

    uint256 remaining = _d;
    uint256 qx = 0;
    uint256 qy = 0;
    uint256 qz = 1;

    // Double and add algorithm
    while (remaining != 0) {
      if ((remaining & 1) != 0) {
        (qx, qy, qz) = jacAdd(qx, qy, qz, _x, _y, _z, _pp);
      }
      remaining = remaining / 2;
      (_x, _y, _z) = jacDouble(_x, _y, _z, _aa, _pp);
    }
    return (qx, qy, qz);
  }
  }

  function ecMul(uint256 _k, uint256 _x, uint256 _y, uint256 _aa, uint256 _pp) internal pure returns(uint256, uint256) {
    // Jacobian multiplication
    (uint256 x1, uint256 y1, uint256 z1) = jacMul(_k, _x, _y, 1, _aa, _pp);
    // Get back to affine
    return toAffine(x1, y1, z1, _pp);
  }
}

library CommonStructs {
    struct Point {
    uint256 x;
    uint256 y;
  }

  struct Points {
    Point[] X;
    Point[] PK;
  }

}

contract MultiSig {

    uint256 public constant GX = 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798;
    uint256 public constant GY = 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8;
    uint256 public constant AA = 0;
    uint256 public constant BB = 7;
    uint256 public constant PP = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F;
    uint256 public constant QQ = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141;
    uint public counter = 0;
    mapping (address => uint256) private accounts;
	
	receive () payable external{
	
	
	}
	/*
	from is a schorr multisig instance- sum(H(
	amount in wei
	
	x, z multisigs from server
	*/
	function pay (address from, uint amount, address to, uint x, uint z, uint m) public{

	//pk and xbar are expected to be points
	//m is expected to be bytes. Check to see what I'm getting from server. See if I can change it to bytes
        bytes32 m = sha256(abi.encodePacked(to, counter, amount));
            if (verify(z, pk, x, m)){
                payable(to).transfer(amount);
                //address = keccak(pkbar)
                accounts[from] -= amount;
                accounts[to] += amount;
            }
		
    }
	
	function verify(uint256 zBar, CommonStructs.Point memory pkBar, CommonStructs.Point memory xBar, bytes memory message) pure public returns (bool) {
  (uint256 actual_x, uint256 actual_y) = EllipticCurve.ecMul(zBar, GX, GY, AA, PP);

  // uint256 c = uint256(keccak256(bytes.concat(bytes32(pkBarSum.x), bytes32(pkBarSum.y), bytes32(xBarSum.x), bytes32(xBarSum.y), bytes32(message))));
  uint c = uint(keccak256(abi.encodePacked(pkBar.x, pkBar.y, xBar.x, xBar.y, message)));

  // return c;
  (uint256 mul_x, uint256 mul_y) = EllipticCurve.ecMul(c, pkBar.x, pkBar.y, AA, PP);
  (uint256 expected_x, uint256 expected_y) = EllipticCurve.ecAdd(mul_x, mul_y, xBar.x, xBar.y, AA, PP);

  // return actual_y;
  if (actual_y == expected_y) {
      counter++;
      return true;
  }
  if (actual_x == expected_x) {
    counter++;
    return true;
  }

  return false; 
}
	

    
}
