// SPDX-License-Identifier: MIT
pragma solidity ^0.8.17;

import "./Ownable.sol";
import "./IdentityRegistry.sol";

// Token de sécurité pour un projet immobilier
contract HouseSecurityToken is Ownable {
    // Token metadata
    string public name;
    string public symbol;
    uint8 public constant decimals = 0;
    uint256 public constant MAX_INVESTOR_PERCENT = 20;

    // Supply
    uint256 public totalSupply;
    uint256 public maxSupply;

    mapping(address => uint256) public balanceOf;

    // Access control
    address public projectOwner;
    address public factory;
    address public saleContract;
    address public saleFactory;
    // KYC registry
    IIdentityRegistry public identityRegistry;

    // Pause mechanism
    bool public paused;

    // Events
    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Mint(address indexed to, uint256 amount);
    event Burn(address indexed from, uint256 amount);
    event Paused(address indexed by);
    event Unpaused(address indexed by);
    event SaleContractUpdated(address indexed oldSale, address indexed newSale);
    event SaleFactoryUpdated(address indexed oldFactory, address indexed newFactory); // 🔥 AJOUT

    // Modifiers
    modifier onlyProjectOrPlatformOrSale() {
        require(
            msg.sender == projectOwner ||
                msg.sender == owner ||
                msg.sender == saleContract,
            "Token: caller not authorized"
        );
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Token: transfers paused");
        _;
    }

    modifier onlyOwnerOrSaleFactory() {
        require(
            msg.sender == owner || msg.sender == saleFactory,
            "Token: caller not owner or saleFactory"
        );
        _;
    }

    // Constructor
    constructor(
        address platformOwner,
        address _projectOwner,
        string memory _name,
        string memory _symbol,
        uint256 _maxSupply,
        address _identityRegistry
    ) Ownable(platformOwner) {
        require(_projectOwner != address(0), "Token: projectOwner zero");
        require(_identityRegistry != address(0), "Token: identityRegistry zero");

        projectOwner = _projectOwner;
        name = _name;
        symbol = _symbol;
        maxSupply = _maxSupply;
        identityRegistry = IIdentityRegistry(_identityRegistry);
        factory = msg.sender; // la factory est le déployeur
    }

    function setSaleFactory(address _saleFactory) external onlyOwner {
        require(_saleFactory != address(0), "Token: saleFactory zero");
        emit SaleFactoryUpdated(saleFactory, _saleFactory);
        saleFactory = _saleFactory;
    }

    function setSaleContract(address _saleContract) external onlyOwnerOrSaleFactory {
        require(_saleContract != address(0), "Token: saleContract zero");
        emit SaleContractUpdated(saleContract, _saleContract);
        saleContract = _saleContract;
    }

    // Internal checks
    function _checkKYC(address wallet) internal view {
        require(identityRegistry.isVerified(wallet), "Token: wallet not KYC");
    }

    function _checkMaxSupply(uint256 amount) internal view {
        if (maxSupply != 0) {
            require(
                totalSupply + amount <= maxSupply,
                "Token: maxSupply exceeded"
            );
        }
    }

    function _checkInvestorCap(uint256 newBalance) internal view {
        if (maxSupply == 0) return;
        uint256 maxAllowed = (maxSupply * MAX_INVESTOR_PERCENT) / 100;

        require(
            newBalance <= maxAllowed,
            "Token: exceeds 20% investor cap"
        );
    }

    // Admin functions
    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    // Mint / Burn
    function mint(address to, uint256 amount)
        external
        onlyProjectOrPlatformOrSale
    {
        require(to != address(0), "Token: mint to zero");
        require(amount > 0, "Token: amount zero");

        _checkKYC(to);
        _checkMaxSupply(amount);
        _checkInvestorCap(balanceOf[to] + amount);

        balanceOf[to] += amount;
        totalSupply += amount;

        emit Mint(to, amount);
        emit Transfer(address(0), to, amount);
    }

    function burn(address from, uint256 amount)
        external
        onlyProjectOrPlatformOrSale
    {
        require(from != address(0), "Token: burn from zero");
        require(balanceOf[from] >= amount, "Token: insufficient balance");

        balanceOf[from] -= amount;
        totalSupply -= amount;

        emit Burn(from, amount);
        emit Transfer(from, address(0), amount);
    }

    // Transfer
    function transfer(address to, uint256 amount)
        external
        whenNotPaused
        returns (bool)
    {
        address from = msg.sender;

        require(to != address(0), "Token: transfer to zero");
        require(amount > 0, "Token: amount zero");
        require(balanceOf[from] >= amount, "Token: insufficient balance");

        _checkKYC(from);
        _checkKYC(to);
        _checkInvestorCap(balanceOf[to] + amount);

        balanceOf[from] -= amount;
        balanceOf[to] += amount;

        emit Transfer(from, to, amount);
        return true;
    }
}
