import { config as dotenvConfig } from "dotenv";
dotenvConfig();

import fs from "fs";
import hre from "hardhat";
import { constants } from "ethers";
import {
  transmitterAddress,
  chainSlugs,
  executorAddress,
  switchboards,
  watcherAddress,
  socketOwner,
} from "../constants";
import { config } from "./config";
import {
  deployedAddressPath,
  getCapacitorAddress,
  getChainRoleHash,
  getDecapacitorAddress,
  getInstance,
  getRoleHash,
  getSwitchboardAddress,
} from "./utils";
import { assert } from "console";
import { DeploymentMode, IntegrationTypes, NativeSwitchboard } from "../../src";

const mode = process.env.DEPLOYMENT_MODE as DeploymentMode | DeploymentMode.DEV;

async function checkNative(
  contractAddr,
  localChain,
  remoteChain,
  remoteSwitchboard
) {
  const contractName = switchboards[localChain][remoteChain];
  const switchboard = await getInstance(contractName, contractAddr);

  let hasRole = await switchboard["hasRole(bytes32,address)"](
    getRoleHash("GAS_LIMIT_UPDATER_ROLE"),
    transmitterAddress[localChain]
  );
  assert(
    hasRole,
    `❌ NativeSwitchboard has wrong GAS_LIMIT_UPDATER_ROLE ${remoteChain}`
  );

  if (contractName === NativeSwitchboard.POLYGON_L1) {
    const remoteSb = await switchboard.fxChildTunnel();
    assert(remoteSb === remoteSwitchboard, "❌ wrong fxChildTunnel set");
  } else if (contractName === NativeSwitchboard.POLYGON_L2) {
    const remoteSb = await switchboard.fxRootTunnel();
    assert(remoteSb === remoteSwitchboard, "❌ wrong fxRootTunnel set");
  } else {
    const remoteSb = await switchboard.remoteNativeSwitchboard();
    assert(remoteSb === remoteSwitchboard, "❌ wrong remote switchboard set");
  }
}

async function checkFast(contractAddr, localChain, remoteChain) {
  const switchboard = await getInstance("FastSwitchboard", contractAddr);

  console.log(contractAddr, "bvhdgvghsdbjhsdjcndjck");
  let hasRole = await switchboard["hasRole(bytes32,address)"](
    getChainRoleHash("WATCHER_ROLE", chainSlugs[remoteChain]),
    watcherAddress[localChain]
  );
  assert(hasRole, `❌ FastSwitchboard has wrong TRIP_ROLE ${remoteChain}`);
}

async function checkDefault(contractAddr, localChain, remoteChain) {
  const switchboard = await getInstance("FastSwitchboard", contractAddr);

  // check roles
  let hasRole = await switchboard["hasRole(bytes32,address)"](
    getChainRoleHash("TRIP_ROLE", chainSlugs[remoteChain]),
    transmitterAddress[localChain]
  );
  assert(hasRole, `❌ Switchboard has wrong TRIP_ROLE ${remoteChain}`);

  hasRole = await switchboard["hasRole(bytes32,address)"](
    getChainRoleHash("UNTRIP_ROLE", chainSlugs[remoteChain]),
    transmitterAddress[localChain]
  );
  assert(hasRole, `❌ Switchboard has wrong UNTRIP_ROLE ${remoteChain}`);

  hasRole = await switchboard["hasRole(bytes32,address)"](
    getChainRoleHash("GAS_LIMIT_UPDATER_ROLE", chainSlugs[remoteChain]),
    transmitterAddress[localChain]
  );
  assert(
    hasRole,
    `❌ Switchboard has wrong GAS_LIMIT_UPDATER_ROLE ${remoteChain}`
  );
}

async function checkSwitchboardRoles(chain, contractAddr) {
  const switchboard = await getInstance("PolygonL1Switchboard", contractAddr);

  // check roles
  let hasRole = await switchboard["hasRole(bytes32,address)"](
    getRoleHash("GOVERNANCE_ROLE"),
    socketOwner
  );
  assert(hasRole, `❌ Switchboard has wrong governance address ${chain}`);

  hasRole = await switchboard["hasRole(bytes32,address)"](
    getRoleHash("RESCUE_ROLE"),
    socketOwner
  );
  assert(hasRole, `❌ Switchboard has wrong rescue address ${chain}`);

  hasRole = await switchboard["hasRole(bytes32,address)"](
    getRoleHash("WITHDRAW_ROLE"),
    socketOwner
  );
  assert(hasRole, `❌ Switchboard has wrong withdraw role address ${chain}`);

  hasRole = await switchboard["hasRole(bytes32,address)"](
    getRoleHash("TRIP_ROLE"),
    socketOwner
  );
  assert(hasRole, `❌ Switchboard has wrong trip role address ${chain}`);

  hasRole = await switchboard["hasRole(bytes32,address)"](
    getRoleHash("UNTRIP_ROLE"),
    socketOwner
  );
  assert(hasRole, `❌ Switchboard has wrong untrip role address ${chain}`);
}

async function checkSwitchboardRegistration(
  siblingChain,
  socketAddr,
  switchboard,
  capacitor,
  decapacitor
) {
  const socket = await getInstance("Socket", socketAddr);

  const capacitor__ = await socket.capacitors__(
    switchboard,
    chainSlugs[siblingChain]
  );
  const decapacitor__ = await socket.decapacitors__(
    switchboard,
    chainSlugs[siblingChain]
  );

  assert(
    capacitor__ !== constants.AddressZero,
    "❌ Switchboard not registered"
  );
  assert(capacitor__ === capacitor, "❌ Wrong Capacitor");
  assert(decapacitor__ === decapacitor, "❌ Wrong DeCapacitor");
}

async function checkCounter(
  siblingSlug,
  localConfig,
  remoteConfig,
  integrationType
) {
  const socket = await getInstance("Socket", localConfig["Socket"]);

  // check config
  const config = await socket.getPlugConfig(
    localConfig["Counter"],
    chainSlugs[siblingSlug]
  );

  if (
    !localConfig?.["integrations"]?.[chainSlugs[siblingSlug]]?.[integrationType]
  ) {
    console.log(
      `❌ No integration found for ${siblingSlug} for ${integrationType}`
    );
    return;
  }

  const outboundSb =
    localConfig["integrations"][chainSlugs[siblingSlug]][integrationType];
  assert(
    config.siblingPlug == remoteConfig["Counter"] &&
      config.inboundSwitchboard__ == outboundSb["switchboard"] &&
      config.outboundSwitchboard__ == outboundSb["switchboard"] &&
      config.capacitor__ == outboundSb["capacitor"] &&
      config.decapacitor__ == outboundSb["decapacitor"],
    `❌ Socket has wrong config set for ${siblingSlug}`
  );
}

async function checkTransmitManager(chain, contractAddr, remoteChain) {
  const transmitManager = await getInstance("TransmitManager", contractAddr);

  // check roles
  let hasRole = await transmitManager["hasRole(bytes32,address)"](
    getRoleHash("GOVERNANCE_ROLE"),
    socketOwner
  );
  assert(hasRole, `❌ TransmitManager has wrong governance address ${chain}`);

  hasRole = await transmitManager["hasRole(bytes32,address)"](
    getRoleHash("RESCUE_ROLE"),
    socketOwner
  );

  assert(hasRole, `❌ TransmitManager has wrong rescue address ${chain}`);

  hasRole = await transmitManager["hasRole(bytes32,address)"](
    getRoleHash("WITHDRAW_ROLE"),
    socketOwner
  );

  assert(
    hasRole,
    `❌ TransmitManager has wrong withdraw role address ${chain}`
  );

  hasRole = await transmitManager["hasRole(bytes32,address)"](
    getChainRoleHash("TRANSMITTER_ROLE", chainSlugs[chain]),
    transmitterAddress[chain]
  );
  assert(
    hasRole,
    `❌ TransmitManager has wrong transmitter address for ${chain}`
  );

  hasRole = await transmitManager["hasRole(bytes32,address)"](
    getChainRoleHash("TRANSMITTER_ROLE", chainSlugs[remoteChain]),
    transmitterAddress[chain]
  );
  assert(
    hasRole,
    `❌ TransmitManager has wrong transmitter address for ${remoteChain}`
  );

  hasRole = await transmitManager["hasRole(bytes32,address)"](
    getChainRoleHash("GAS_LIMIT_UPDATER_ROLE", chainSlugs[remoteChain]),
    transmitterAddress[chain]
  );
  assert(
    hasRole,
    `❌ TransmitManager has wrong GAS_LIMIT_UPDATER_ROLE for ${remoteChain}`
  );

  hasRole = await transmitManager["hasRole(bytes32,address)"](
    getRoleHash("GAS_LIMIT_UPDATER_ROLE"),
    transmitterAddress[chain]
  );
  assert(
    hasRole,
    `❌ TransmitManager has wrong GAS_LIMIT_UPDATER_ROLE for ${chain}`
  );
}

async function checkExecutionManager(chain, contractAddr) {
  const executionManager = await getInstance("ExecutionManager", contractAddr);

  // check roles
  let hasRole = await executionManager["hasRole(bytes32,address)"](
    getRoleHash("GOVERNANCE_ROLE"),
    socketOwner
  );
  assert(hasRole, `❌ ExecutionManager has wrong governance address ${chain}`);

  hasRole = await executionManager["hasRole(bytes32,address)"](
    getRoleHash("RESCUE_ROLE"),
    socketOwner
  );

  assert(hasRole, `❌ ExecutionManager has wrong rescue address ${chain}`);

  hasRole = await executionManager["hasRole(bytes32,address)"](
    getRoleHash("WITHDRAW_ROLE"),
    socketOwner
  );

  assert(
    hasRole,
    `❌ ExecutionManager has wrong withdraw role address ${chain}`
  );

  hasRole = await executionManager["hasRole(bytes32,address)"](
    getRoleHash("EXECUTOR_ROLE"),
    executorAddress[chain]
  );
  assert(hasRole, `❌ ExecutionManager has wrong executor address ${chain}`);
}

async function checkSocket(chain, socketAddr) {
  const socket = await getInstance("Socket", socketAddr);

  // check roles
  let hasRole = await socket["hasRole(bytes32,address)"](
    getRoleHash("GOVERNANCE_ROLE"),
    socketOwner
  );
  assert(hasRole, `❌ Socket has wrong governance address ${chain}`);

  hasRole = await socket["hasRole(bytes32,address)"](
    getRoleHash("RESCUE_ROLE"),
    socketOwner
  );

  assert(hasRole, `❌ Socket has wrong rescue address ${chain}`);
}

async function checkOracle(chain, oracleAddr, transmitManagerAddr) {
  const oracle = await getInstance("GasPriceOracle", oracleAddr);

  // check if transmit manager is set
  const transmitManager = await oracle.transmitManager__();
  assert(
    transmitManager.toLowerCase() === transmitManagerAddr.toLowerCase(),
    `❌ TransmitManager not set in oracle on ${chain}`
  );

  // check roles
  let hasRole = await oracle["hasRole(bytes32,address)"](
    getRoleHash("GOVERNANCE_ROLE"),
    socketOwner
  );
  assert(hasRole, `❌ GasPriceOracle has wrong governance address ${chain}`);

  hasRole = await oracle["hasRole(bytes32,address)"](
    getRoleHash("RESCUE_ROLE"),
    socketOwner
  );

  assert(hasRole, `❌ GasPriceOracle has wrong rescue address ${chain}`);
}

async function checkIntegration(
  configurationType: IntegrationTypes,
  localChain: string,
  remoteChain: string,
  localConfig,
  remoteConfig
) {
  // config related contracts
  let localSwitchboard = getSwitchboardAddress(
    chainSlugs[remoteChain],
    configurationType,
    localConfig
  );
  let localCapacitor = getCapacitorAddress(
    chainSlugs[remoteChain],
    configurationType,
    localConfig
  );
  let localDecapacitor = getDecapacitorAddress(
    chainSlugs[remoteChain],
    configurationType,
    localConfig
  );

  let remoteSwitchboard = getSwitchboardAddress(
    chainSlugs[localChain],
    configurationType,
    remoteConfig
  );
  let remoteCapacitor = getCapacitorAddress(
    chainSlugs[localChain],
    configurationType,
    remoteConfig
  );
  let remoteDecapacitor = getDecapacitorAddress(
    chainSlugs[localChain],
    configurationType,
    remoteConfig
  );

  if (!localSwitchboard || !localCapacitor || !localDecapacitor) {
    console.log(
      `❌ Config contracts do not exist for ${configurationType} on ${localChain}`
    );
    return { localSwitchboard, remoteSwitchboard };
  }

  if (!remoteSwitchboard || !remoteCapacitor || !remoteDecapacitor) {
    console.log(
      `❌ Config contracts do not exist for ${configurationType} on ${remoteChain}`
    );
    return { localSwitchboard, remoteSwitchboard };
  }
  console.log("✅ All contracts exist");

  await hre.changeNetwork(remoteChain);
  await checkSwitchboardRegistration(
    localChain,
    remoteConfig["Socket"],
    remoteSwitchboard,
    remoteCapacitor,
    remoteDecapacitor
  );

  await hre.changeNetwork(localChain);
  await checkSwitchboardRegistration(
    remoteChain,
    localConfig["Socket"],
    localSwitchboard,
    localCapacitor,
    localDecapacitor
  );
  console.log("✅ Switchboards registered");

  return { localSwitchboard, remoteSwitchboard };
}

function checkCoreContractAddress(
  localConfig,
  remoteConfig,
  localChain,
  remoteChain
) {
  // contracts exist:
  // core contracts
  if (
    !localConfig["Counter"] ||
    !localConfig["CapacitorFactory"] ||
    !localConfig["ExecutionManager"] ||
    !localConfig["GasPriceOracle"] ||
    !localConfig["Hasher"] ||
    !localConfig["SignatureVerifier"] ||
    !localConfig["Socket"] ||
    !localConfig["TransmitManager"] ||
    !localConfig["SocketBatcher"]
  ) {
    console.log(`❌ Core contracts do not exist for ${localChain}`);
    return;
  }

  if (
    !remoteConfig["Counter"] ||
    !remoteConfig["CapacitorFactory"] ||
    !remoteConfig["ExecutionManager"] ||
    !remoteConfig["GasPriceOracle"] ||
    !remoteConfig["Hasher"] ||
    !remoteConfig["SignatureVerifier"] ||
    !remoteConfig["Socket"] ||
    !remoteConfig["TransmitManager"] ||
    !remoteConfig["SocketBatcher"]
  ) {
    console.log(`❌ Core contracts do not exist for ${remoteChain}`);
    return;
  }
}

export const main = async () => {
  try {
    for (let chain in config) {
      console.log(`\n🤖 Testing configs for ${chain}`);
      const chainSetups = config[chain];

      for (let index = 0; index < chainSetups.length; index++) {
        let remoteChain = chainSetups[index]["remoteChain"];
        let config = chainSetups[index]["config"];

        if (chain === remoteChain) throw new Error("Wrong chains");

        if (!fs.existsSync(deployedAddressPath(mode))) {
          throw new Error("addresses.json not found");
        }

        const addresses = JSON.parse(
          fs.readFileSync(deployedAddressPath(mode), "utf-8")
        );
        if (
          !addresses[chainSlugs[chain]] ||
          !addresses[chainSlugs[remoteChain]]
        ) {
          throw new Error("Deployed Addresses not found");
        }

        let remoteConfig = addresses[chainSlugs[remoteChain]];
        let localConfig = addresses[chainSlugs[chain]];

        await hre.changeNetwork(chain);
        checkCoreContractAddress(localConfig, remoteConfig, chain, remoteChain);
        console.log("✅ Checked Core contracts");

        await checkOracle(
          chain,
          localConfig["GasPriceOracle"],
          localConfig["TransmitManager"]
        );
        console.log("✅ Checked Oracle");

        await checkSocket(chain, localConfig["Socket"]);
        console.log("✅ Checked Socket");

        await checkExecutionManager(chain, localConfig["ExecutionManager"]);
        console.log("✅ Checked ExecutionManager");

        await checkTransmitManager(
          chain,
          localConfig["TransmitManager"],
          remoteChain
        );
        console.log("✅ Checked TransmitManager");

        await checkCounter(
          remoteChain,
          localConfig,
          remoteConfig,
          chainSetups[index]["configForCounter"]
        );
        console.log("✅ Checked Counter");

        // verify contracts for different configurations
        for (let index = 0; index < config.length; index++) {
          console.log(
            `\n🚀 Testing for ${chain} and ${remoteChain} for integration type ${config[index]}`
          );

          const { localSwitchboard, remoteSwitchboard } =
            await checkIntegration(
              config[index],
              chain,
              remoteChain,
              localConfig,
              remoteConfig
            );
          await checkSwitchboardRoles(chain, localSwitchboard);

          if (config === IntegrationTypes.native) {
            await checkNative(
              localSwitchboard,
              chain,
              remoteChain,
              remoteSwitchboard
            );
          } else {
            await checkDefault(localSwitchboard, chain, remoteChain);
            if (config === IntegrationTypes.fast) {
              await checkFast(localSwitchboard, chain, remoteChain);
            }
          }
        }
      }
    }
  } catch (error) {
    console.log("Error while verifying contracts", error);
    throw error;
  }
};

main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error(error);
    process.exit(1);
  });
