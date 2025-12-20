// scripts/test_staking.cjs
const hre = require("hardhat");
const { ethers } = hre;

async function main() {
  const [signer] = await ethers.getSigners();
  const me = signer.address;
  const mgrAddr = "0xD7BF0f6Ec8Cb9b8f334cfe012D1021d54Dc273b4"; // Manager on Zeta
  const wZetaAddr = "0x5F0b1a82749cb4E2278EC87F8BF6B618dC71a8bf"; // WZETA on Athens
  const contentId = ethers.keccak256(ethers.toUtf8Bytes("exercise"));
  const AMOUNT_STAKE = ethers.parseEther("0.1");
  const REWARD_AMOUNT = ethers.parseEther("0.05");

  console.log("👤 Signer :", me);

  // WZETA 合约（含 approve/transfer）
  const wZeta = await ethers.getContractAt(
    [
      "function deposit() payable",
      "function approve(address,uint256) returns (bool)",
      "function transfer(address,uint256) returns (bool)",
      "function allowance(address,address) view returns (uint256)",
      "function balanceOf(address) view returns (uint256)"
    ],
    wZetaAddr
  );

  // Manager 合约
  const mgr = await ethers.getContractAt("TalkToEarnManager", mgrAddr);

  // wrap 如余额不足
  const balZeta = await ethers.provider.getBalance(me);
  const balWZeta = await wZeta.balanceOf(me);
  if (balWZeta < AMOUNT_STAKE) {
    const wrapAmt = AMOUNT_STAKE - balWZeta;
    if (balZeta < wrapAmt) throw new Error("原生 ZETA 不足，先去 faucet 领");
    console.log("💧 wrapping ZETA -> WZETA:", ethers.formatEther(wrapAmt));
    await (await wZeta.deposit({ value: wrapAmt })).wait();
  }

  // 授权
  const allow = await wZeta.allowance(me, mgrAddr);
  if (allow < AMOUNT_STAKE) {
    console.log("🔓 approve ...");
    await (await wZeta.approve(mgrAddr, ethers.MaxUint256)).wait();
  }

  // 质押
  console.log("🥩 staking", ethers.formatEther(AMOUNT_STAKE), "WZETA");
  const txStake = await mgr.stake(contentId, wZetaAddr, AMOUNT_STAKE);
  await txStake.wait();
  console.log("✅ stake tx:", txStake.hash);

  // 给奖励池充值
  console.log("💰 funding reward pool", ethers.formatEther(REWARD_AMOUNT));
  await (await wZeta.transfer(mgrAddr, REWARD_AMOUNT)).wait();

  // 分账
  console.log("🎁 rewardOnUse ...");
  const txReward = await mgr.rewardOnUse(contentId, wZetaAddr, REWARD_AMOUNT);
  await txReward.wait();
  console.log("✅ reward tx:", txReward.hash);

  // 领取
  console.log("🧾 claim ...");
  const txClaim = await mgr.claim(contentId, wZetaAddr);
  await txClaim.wait();
  console.log("✅ claim tx:", txClaim.hash);

  // 查看质押与余额
  const stakeInfo = await mgr.stakes(contentId, wZetaAddr, me);
  const myWZeta = await wZeta.balanceOf(me);
  console.log("📊 staked:", ethers.formatEther(stakeInfo.amount));
  console.log("💼 my WZETA:", ethers.formatEther(myWZeta));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
