/**
 * SimpleDemo - ZetaChain 核心交互逻辑
 * 集成功能：
 * 1. ZETA 跨链转账 (ZetaChain -> BSC)
 * 2. TalkToEarn 跨链消息传递 (Any Chain -> ZetaChain)
 * 3. AI 勋章 (NFT) 余额查询
 */

import { ethers } from 'ethers'
import { switchToChain } from './chains'
import { Intent } from '../types/intent' // 确保路径根据你的项目结构正确引用

// ==========================================
// 1. 合约地址配置 (你刚刚部署的合约)
// ==========================================

// 你的 TalkToEarnManager 合约地址 (新)
export const MANAGER_CONTRACT_ADDRESS = '0xD7BF0f6Ec8Cb9b8f334cfe012D1021d54Dc273b4'

// 你的 NFT 合约地址 (新)
export const NFT_CONTRACT_ADDRESS = '0xB7277D1C77B6239910f0F67ad72A23cB13a6Df66'

// ZetaChain Athens (7001) 的 ZETA Token 合约（用于跨链 sendZeta 之前的 wrap + approve）
const ZETA_TOKEN_ADDRESS =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ZETA_TOKEN_ADDRESS) ||
  '0x5F0b1a82749cb4E2278EC87F8BF6B618dC71a8bf'

// ZetaChain Athens (7001) 的 Connector 合约（sendZeta 实际通过 Connector.send 完成）
const ZETA_CONNECTOR_ADDRESS =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_ZETA_CONNECTOR_ADDRESS) ||
  '0x239e96c8f17C85c30100AC26F635Ea15f23E9c67'

// BSC Testnet 链 ID
const BSC_CHAIN_ID = 97

// 最小跨链金额
const MIN_CROSS_CHAIN_AMOUNT = ethers.parseEther('0.23')

// ==========================================
// 2. ABI 定义
// ==========================================

/**
 * GatewayEVM ABI（源链 -> ZetaChain 的跨链消息/带资产调用）
 */
const GATEWAY_ABI = [
  'function call(address receiver, bytes calldata payload, tuple(address revertAddress, bool callOnRevert, address abortAddress, bytes revertMessage, uint256 onRevertGasLimit) revertOptions) external payable',
  'function depositAndCall(address receiver, uint256 amount, address asset, bytes calldata payload, tuple(address revertAddress, bool callOnRevert, address abortAddress, bytes revertMessage, uint256 onRevertGasLimit) revertOptions) external payable'
]

/**
 * Connector ABI（ZetaChain -> 外链的 sendZeta）
 * 参考：@zetachain/toolkit 的 sendFunctionAbi
 */
const CONNECTOR_SEND_ABI = [
  'function send((uint256 destinationChainId, bytes destinationAddress, uint256 destinationGasLimit, bytes message, uint256 zetaValueAndGas, bytes zetaParams) input) external'
]

/**
 * Zeta Token ABI（approve）
 */
const ZETA_TOKEN_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)'
]

/**
 * NFT ABI - 用于前端展示
 */
const NFT_ABI = [
  'function balanceOf(address owner) external view returns (uint256)',
  'function tokenURI(uint256 tokenId) public view returns (string memory)',
  'function name() public view returns (string memory)',
  'function symbol() public view returns (string memory)'
]

// ==========================================
// 3. 辅助函数
// ==========================================

function getBscGatewayEvmAddress(chainId: number): string | null {
  // 可选：通过环境变量覆盖（方便主网/测试网切换）
  const envOverride =
    typeof import.meta !== 'undefined' ? import.meta.env?.VITE_EVM_GATEWAY_ADDRESS : undefined
  if (envOverride) return envOverride

  // 默认映射：BSC Testnet / BSC Mainnet
  if (chainId === 97) return '0x0c487a766110c85d301d96e33579c5b317fa4995'
  if (chainId === 56) return '0x48B9AACC350b20147001f88821d31731Ba4C30ed'
  return null
}

// ==========================================
// 4. 核心功能函数
// ==========================================

/**
 * [原有功能] 执行 ZETA 跨链转账 (ZetaChain -> BSC)
 */
export async function zetaChainCrossChainTransfer(
  intent: Intent,
  provider: ethers.BrowserProvider,
  signer: ethers.JsonRpcSigner
): Promise<string> {
  console.log('🔍 ZetaChain 跨链转账:', intent)

  // 验证参数
  if (intent.fromChain !== 'zetachain' || intent.toChain !== 'bsc') {
    throw new Error('仅支持从 ZetaChain 跨链到 BSC')
  }

  if (!intent.amount) {
    throw new Error('缺少转账金额')
  }

  // 确保连接到 ZetaChain
  await switchToChain('zetachain')
  
  // 重新获取 provider 和 signer
  if (typeof window === 'undefined' || !window.ethereum) {
    throw new Error('MetaMask 未安装')
  }
  const newProvider = new ethers.BrowserProvider(window.ethereum)
  const newSigner = await newProvider.getSigner()

  const userAddress = await newSigner.getAddress()
  const recipientAddress = intent.recipient || userAddress

  if (!ethers.isAddress(recipientAddress)) {
    throw new Error(`接收地址格式不正确: ${recipientAddress}`)
  }

  const amount = ethers.parseEther(intent.amount)

  if (amount < MIN_CROSS_CHAIN_AMOUNT) {
    throw new Error(`跨链金额太小，最小要求: 0.23 ZETA`)
  }

  // sendZeta（ZetaChain -> 外链）当前通过 Connector.send 实现，而不是 GatewayZEVM.sendZeta
  const connector = new ethers.Contract(ZETA_CONNECTOR_ADDRESS, CONNECTOR_SEND_ABI, newSigner)
  const zetaToken = new ethers.Contract(ZETA_TOKEN_ADDRESS, ZETA_TOKEN_ABI, newSigner)

  // 1) 把 native ZETA 转进 ZetaToken（wrap），使得后续 approve + send 能使用 ERC20 余额
  await (await newSigner.sendTransaction({ to: ZETA_TOKEN_ADDRESS, value: amount })).wait()

  // 2) approve Connector 使用你的 ZETA Token
  await (await zetaToken.approve(ZETA_CONNECTOR_ADDRESS, amount)).wait()

  // 3) 发起跨链
  const destinationGasLimit = 500000
  const destinationAddressBytes = ethers.getBytes(recipientAddress)
  const tx = await connector.send({
    destinationChainId: BSC_CHAIN_ID,
    destinationAddress: destinationAddressBytes,
    destinationGasLimit,
    message: '0x',
    zetaValueAndGas: amount,
    zetaParams: '0x',
  })

  console.log('✅ 跨链转账交易已发送:', tx.hash)
  await tx.wait()
  return tx.hash
}

/**
 * [原有功能] 查询 ZETA 余额
 */
export async function getZetaBalance(
  provider: ethers.BrowserProvider,
  signer: ethers.JsonRpcSigner
): Promise<string> {
  try {
    const userAddress = await signer.getAddress()
    const balance = await provider.getBalance(userAddress)
    return ethers.formatEther(balance)
  } catch (error: any) {
    console.error('❌ 查询ZETA余额失败:', error)
    return '0'
  }
}

/**
 * [新增功能 🚀] 查询用户获得的 TalkToEarn NFT 勋章数量
 * 这是一个 Read-Only 操作，不需要 Gas
 */
export async function getUserNFTBalance(
  provider: ethers.BrowserProvider,
  userAddress: string
): Promise<number> {
  try {
    // 简单检查网络，如果不是 ZetaChain 可能无法读取，或者读取的是空
    const network = await provider.getNetwork()
    // ZetaChain Athens Testnet ChainID is 7001
    if (network.chainId !== 7001n) {
      // 如果不在 ZetaChain，可以静默返回 0，或者尝试用 JsonRpcProvider 连接 ZetaChain RPC 直接查询
      return 0
    }

    const nftContract = new ethers.Contract(NFT_CONTRACT_ADDRESS, NFT_ABI, provider)
    const balance = await nftContract.balanceOf(userAddress)
    console.log(`🏆 用户 NFT 余额: ${balance.toString()}`)
    return Number(balance)
  } catch (error) {
    console.error('❌ 查询 NFT 失败:', error)
    return 0
  }
}

/**
 * [新增功能 🚀] 触发跨链 TalkToEarn (模拟从其他链调用 ZetaChain)
 * 场景：用户在 BSC 上点击“聊天挖矿”，发送一条消息到 ZetaChain，触发 NFT 铸造。
 * 注意：此函数假设用户当前已连接到源链（如 BSC Testnet）
 */
export async function triggerCrossChainTalkToEarn(
  signer: ethers.JsonRpcSigner,
  message: string = "TalkToEarn Chat Session"
): Promise<string> {
  console.log('🚀 正在发起跨链 TalkToEarn 调用...')

  if (!signer.provider) {
    throw new Error('Signer provider 不存在，无法获取 chainId')
  }
  const network = await signer.provider.getNetwork()
  const chainId = Number(network.chainId)
  const gatewayAddress = getBscGatewayEvmAddress(chainId)
  if (!gatewayAddress) {
    throw new Error(`未配置该链的 GatewayEVM 地址: chainId=${chainId}`)
  }

  const gatewayContract = new ethers.Contract(gatewayAddress, GATEWAY_ABI, signer)

  // 2. 准备调用参数
  // 目标接收者：部署在 ZetaChain 上的 Manager 合约
  const receiver = MANAGER_CONTRACT_ADDRESS
  
  // 消息内容：编码字符串消息
  const payload = ethers.toUtf8Bytes(message)
  
  // RevertOptions: 错误处理配置 (默认不处理回滚以节省 Gas)
  const revertOptions = {
    revertAddress: ethers.ZeroAddress,
    callOnRevert: false,
    abortAddress: ethers.ZeroAddress,
    revertMessage: "0x",
    onRevertGasLimit: 0
  }

  // 3. 调用 Gateway 的 call 函数
  // 这是一个 Cross-Chain Message Passing (CCMP) 操作
  // 通常不需要附带大额 Value，但可能需要支付源链的 Gas 和 跨链费
  // 这里简化处理，未手动计算跨链费，可能需要用户在钱包中确认
  const tx = await gatewayContract.call(
    receiver,
    payload,
    revertOptions
  )

  console.log('✅ 跨链调用已发送! Hash:', tx.hash)
  await tx.wait()
  
  return tx.hash
}
