const { id } = require("ethers");
const cands = [
 // Uniswap v4 (final)
 "Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)",
 "Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)",
 "ModifyLiquidity(bytes32,address,int24,int24,int256,bytes32)",
 "Donate(bytes32,address,uint256,uint256)",
 // Uniswap v4 older draft (as in user's plan)
 "Initialize(bytes32,address,address,uint24,int24,address)",
 // ERC6909 (v4 claims)
 "Transfer(address,address,address,uint256,uint256)",
 "OperatorSet(address,address,bool)",
 "Approval(address,address,uint256,uint256)",
 // Uniswap v3
 "Swap(address,address,int256,int256,uint160,uint128,int24)",
 "Mint(address,address,int24,int24,uint128,uint256,uint256)",
 "Burn(address,int24,int24,uint128,uint256,uint256)",
 "PoolCreated(address,address,uint24,int24,address)",
 // Uniswap v2
 "Swap(address,uint256,uint256,uint256,uint256,address)",
 "Sync(uint112,uint112)",
 "PairCreated(address,address,address,uint256)",
 // ERC20
 "Transfer(address,address,uint256)",
 "Approval(address,address,uint256)",
];
const observed = {
 "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f":"1 emitter 0x8366a39c",
 "0xf208f4912782fd25c7f114ca3723a2d5dd6f3bcc3ac8db5af63baa85f711d5ec":"1 emitter 0x8366a39c",
 "0xc532c43b3423e14ef72748f1c8291238829ca0af8ba9b67975ad1483485a4b4d":"1 emitter 0xe5e70264",
 "0x93485dcd31a905e3ffd7b012abe3438fa8fa77f98ddc9f50e879d3fa7ccdc324":"1 emitter 0xb92fe925",
 "0x37e7f0db430edc9dd31bc66f25f8449353aa0818f503b906747dd8f286cd3802":"3 emitters",
 "0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67":"11 emitters",
 "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef":"many",
 "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925":"many",
};
const map = {};
for (const s of cands) map[id(s)] = s;
console.log("=== MATCHED ===");
for (const [t, note] of Object.entries(observed)) {
  console.log(t.slice(0,20).padEnd(22), (map[t] || "*** UNKNOWN ***").padEnd(62), note);
}
