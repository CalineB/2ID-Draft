// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./Ownable.sol";
import "./IdentityRegistry.sol";
import "./HouseSecurityToken.sol";

contract TokenFactory is Ownable {
    address public immutable identityRegistry;

    address public saleFactory;

    address[] public allHouseTokens;
    mapping(address => address[]) public tokensByProjectOwner;

    event HouseTokenCreated(
        address indexed tokenAddress,
        address indexed projectOwner,
        string name,
        string symbol,
        uint256 maxSupply
    );

    event SaleFactoryUpdated(address indexed oldFactory, address indexed newFactory);

    constructor(address platformOwner, address _identityRegistry)
        Ownable(platformOwner)
    {
        require(_identityRegistry != address(0), "Factory: identityRegistry zero");
        identityRegistry = _identityRegistry;
    }

    // 🔥 AJOUT : l’owner de la factory (platform) configure une fois l'adresse de SaleFactory
    function setSaleFactory(address _saleFactory) external onlyOwner {
        require(_saleFactory != address(0), "Factory: saleFactory zero");
        emit SaleFactoryUpdated(saleFactory, _saleFactory);
        saleFactory = _saleFactory;
    }

    function createHouseToken(
        string calldata name,
        string calldata symbol,
        uint256 maxSupply,
        address projectOwner
    ) external onlyOwner returns (address tokenAddress) {
        require(bytes(name).length > 0, "Factory: name empty");
        require(bytes(symbol).length > 0, "Factory: symbol empty");
        require(projectOwner != address(0), "Factory: projectOwner zero");

        HouseSecurityToken token = new HouseSecurityToken(
            owner,
            projectOwner,
            name,
            symbol,
            maxSupply,
            identityRegistry
        );

        tokenAddress = address(token);

        // ✅ ici : on dit au token "ta saleFactory c'est X"
        if (saleFactory != address(0)) {
            token.setSaleFactory(saleFactory);
        }

        allHouseTokens.push(tokenAddress);
        tokensByProjectOwner[projectOwner].push(tokenAddress);

        emit HouseTokenCreated(tokenAddress, projectOwner, name, symbol, maxSupply);
    }

    function getHouseTokenCount() external view returns (uint256) {
        return allHouseTokens.length;
    }

    function getTokensByProjectOwner(address _projectOwner)
        external
        view
        returns (address[] memory)
    {
        return tokensByProjectOwner[_projectOwner];
    }
}
