import { expect } from "chai";
import { ethers } from "hardhat";
import { string } from "hardhat/internal/core/params/argumentTypes";
import { loadFixture } from "@nomicfoundation/hardhat-network-helpers";

describe("LiquidityPool", function () {
  let liquidityPool: any;
  let weth: any;
  let usdc: any;
  let wethaddr: string;
  let usdcaddr: string;

  async function deployLiquidityPoolFixture() {
    const [owner, user1] = await ethers.getSigners();
    const LiquidityPoolFactory = await ethers.getContractFactory("LiquidityPool");
    const MokenTokenFactory = await ethers.getContractFactory("MockToken");

    // create weth and usdc tokens    
    weth = await MokenTokenFactory.deploy("Wrapped Ether", "WETH", ethers.parseEther("1000000"));
    await weth.waitForDeployment();
    wethaddr = (await weth.getAddress()).toLowerCase();

    usdc = await MokenTokenFactory.deploy("USD Coin", "USDC", ethers.parseUnits("1000000", 18));
    await usdc.waitForDeployment();
    usdcaddr = (await usdc.getAddress()).toLowerCase();
    

    const weth_symbol = "WETH";
    const usdc_symbol = "USDC";
    liquidityPool = await LiquidityPoolFactory.deploy( wethaddr, usdcaddr, weth_symbol, usdc_symbol); //weth/usdc
    await liquidityPool.waitForDeployment();
    console.log("LiquidityPool deployed to:", liquidityPool.address);
    return { liquidityPool, wethaddr, usdcaddr, owner, weth, usdc, user1 };
  }

  describe("Deployment", function () {
    it("Should deploy successfully", async function () {
      const { liquidityPool } = await loadFixture(deployLiquidityPoolFixture);
      const address = await liquidityPool.getAddress();
      console.log(address);
      expect(address).to.be.properAddress;
    })

    it("Should set correct tokens", async function () {
      const { liquidityPool, wethaddr, usdcaddr } = await loadFixture(deployLiquidityPoolFixture);
      const tokenA = (await liquidityPool.tokenA()).toLowerCase();
      const tokenB = (await liquidityPool.tokenB()).toLowerCase();
      expect(tokenA).to.be.equal(wethaddr);
      expect(tokenB).to.be.equal(usdcaddr);
    })

    it("Should set correct LP Token name", async function () {
      const { liquidityPool } = await loadFixture(deployLiquidityPoolFixture);
      const tokenLPaddr = await liquidityPool.lpToken();
      const tokenLP = await ethers.getContractAt("LiquidityPoolToken", tokenLPaddr);
      const tokenName = await tokenLP.name();
      const tokenSymbol = await tokenLP.symbol();

      expect(tokenName).to.be.equal("WETH/USDC Liquidity Pool Token");
      expect(tokenSymbol).to.be.equal("WETH/USDC-LP");
    })
  });

  describe("Add Liquidity", function () {
    it("Should add first liquidity successfully and give sqrt(tokenA*tokenB) LP token", async function () {
      const { liquidityPool, wethaddr, usdcaddr, owner, weth, usdc } = await loadFixture(deployLiquidityPoolFixture);
      const amountWETH = ethers.parseEther("1");
      const amountUSDC = ethers.parseUnits("3000", 18);
      const LPAddress = await liquidityPool.getAddress();

      await weth.connect(owner).approve(LPAddress, amountWETH);
      await usdc.connect(owner).approve(LPAddress, amountUSDC);
      
      await liquidityPool.connect(owner).deposit(amountWETH, amountUSDC);
      expect(await liquidityPool.tokenA_balance()).to.be.equal(amountWETH);
      expect(await liquidityPool.tokenB_balance()).to.be.equal(amountUSDC);

      const lpTokenAddr = await liquidityPool.lpToken();
      const lpToken = await ethers.getContractAt("LiquidityPoolToken", lpTokenAddr);
      const lpTokenBalance = await lpToken.balanceOf(owner.address);
      const totalSupply = await lpToken.totalSupply();
      console.log(lpTokenBalance.toString());

      // expect 54.77 LP tokens to be minted
      expect(lpTokenBalance).to.be.lessThan(ethers.parseUnits("5478", 16));
      expect(lpTokenBalance).to.be.greaterThan(ethers.parseUnits("5477", 16));

      // expect 54.77 LP tokens to be minted
      expect(totalSupply).to.be.lessThan(ethers.parseUnits("5478", 16));
      expect(totalSupply).to.be.greaterThan(ethers.parseUnits("5477", 16));

      // expect token A and B balances to be updated
      expect(await liquidityPool.tokenA_balance()).to.be.equal(amountWETH);
      expect(await liquidityPool.tokenB_balance()).to.be.equal(amountUSDC);
    })

    it("Should add liquidity for existing pool and give token*LPSupply LP tokens", async function () {
      const { liquidityPool, wethaddr, usdcaddr, owner, weth, usdc, user1 } = await loadFixture(deployLiquidityPoolFixture);

      // First deposit
      const amountWETH = ethers.parseEther("1");
      const amountUSDC = ethers.parseUnits("3000", 18);
      const LPAddress = await liquidityPool.getAddress();

      await weth.connect(owner).approve(LPAddress, amountWETH);
      await usdc.connect(owner).approve(LPAddress, amountUSDC);
      
      await liquidityPool.connect(owner).deposit(amountWETH, amountUSDC);

      // Second deposit of user1
      await weth.connect(owner).mint(user1.address, ethers.parseEther("5"));
      await usdc.connect(owner).mint(user1.address, ethers.parseUnits("15000", 18));
      const amountWETH2 = ethers.parseEther("2");
      const amountUSDC2 = ethers.parseUnits("8000", 18);

      await weth.connect(user1).approve(LPAddress, amountWETH2);
      await usdc.connect(user1).approve(LPAddress, amountUSDC2);

      await liquidityPool.connect(user1).deposit(amountWETH2, amountUSDC2);
      expect(await liquidityPool.tokenA_balance()).to.be.equal(amountWETH + amountWETH2);
      expect(await liquidityPool.tokenB_balance()).to.be.equal(amountUSDC + amountUSDC2);

      const lpTokenAddr = await liquidityPool.lpToken();
      const lpToken = await ethers.getContractAt("LiquidityPoolToken", lpTokenAddr);
      const lpTokenBalance = await lpToken.balanceOf(user1.address);
      const totalSupply = await lpToken.totalSupply();

      /* expect 109,54 LP tokens to be minted, cause min(109.54, 146.05) = 109.54
        lpTokenAmount = min(
            (normalizedAmountA * lpToken.totalSupply()) / tokenA_balance,
            (normalizedAmountB * lpToken.totalSupply()) / tokenB_balance
        );
      */
      expect(lpTokenBalance).to.be.lessThan(ethers.parseUnits("10955", 16));
      expect(lpTokenBalance).to.be.greaterThan(ethers.parseUnits("10954", 16));

      // expect 54.77 LP tokens to be minted
      expect(totalSupply).to.be.lessThan(ethers.parseUnits("16433", 16));
      expect(totalSupply).to.be.greaterThan(ethers.parseUnits("16431", 16));
      console.log(totalSupply.toString());
    })
  });
});