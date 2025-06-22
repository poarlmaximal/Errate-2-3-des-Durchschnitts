require("@nomicfoundation/hardhat-toolbox");
require("@nomicfoundation/hardhat-ethers");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.30",
  defaultNetwork: "hardhat",
  networks: {
    hardhat:{
      forking:{
        url: "https://eth-sepolia.g.alchemy.com/v2/************** INSERT YOUR KEY **************",
      },
      mining: {
        auto: true,
        interval: 12000 // Millisekunden
      }
    }
  }
};
