// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./Ownable.sol";
import "./IdentityRegistry.sol";
import "./HouseSecurityToken.sol";
import "./HouseEthSale.sol";

contract SaleFactory is Ownable {
    address public immutable identityRegistry;

    event SaleCreated(
        address indexed token,
        address indexed saleContract,
        address indexed projectOwner,
        uint256 priceWeiPerToken
    );

    constructor(address platformOwner, address _identityRegistry)
        Ownable(platformOwner)
    {
        require(_identityRegistry != address(0), "SaleFactory: identityRegistry zero");
        identityRegistry = _identityRegistry;
    }

    // Crée un contrat de vente HouseEthSale pour un token donné
    // et le branche automatiquement via setSaleContract.
    function createSaleForToken(
        address tokenAddr,
        address projectOwner,
        uint256 priceWeiPerToken
    )
        external
        onlyOwner
        returns (address saleAddr)
    {
        require(tokenAddr != address(0), "SaleFactory: token zero");
        require(projectOwner != address(0), "SaleFactory: projectOwner zero");
        require(priceWeiPerToken > 0, "SaleFactory: price zero");

        HouseSecurityToken token = HouseSecurityToken(tokenAddr);

        address platformOwner = owner;

        HouseEthSale sale = new HouseEthSale(
            platformOwner,
            projectOwner,
            tokenAddr,
            identityRegistry,
            priceWeiPerToken
        );

        saleAddr = address(sale);
        token.setSaleContract(saleAddr);

        emit SaleCreated(tokenAddr, saleAddr, projectOwner, priceWeiPerToken);
    }
}
