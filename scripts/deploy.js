/**
 * Deploy, then immediately prove the one thing the whole game rests on:
 * that a seat cannot read its own card.
 */
import hre from 'hardhat';

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log('deployer', deployer.address, 'on', hre.network.name);

  const F = await hre.ethers.getContractFactory('Incognito');
  const game = await F.deploy();
  await game.waitForDeployment();
  const addr = await game.getAddress();
  console.log('Incognito deployed at', addr);

  // The contract pays Inco per operation, so it needs a float to deal from.
  const fund = process.env.FUND_ETH || '0.002';
  if (fund !== '0') {
    const tx = await deployer.sendTransaction({ to: addr, value: hre.ethers.parseEther(fund) });
    await tx.wait();
    console.log(`funded with ${fund} ETH for shuffle and per-op fees`);
  } else {
    console.log('not funded; send ETH to the contract before opening a table');
  }

  console.log('\nnext:');
  console.log(`  CONTRACT=${addr} npm run keeper`);
}

main().catch(e => { console.error(e); process.exit(1); });
