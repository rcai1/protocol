import React from "react";
import { connect } from "react-redux";
import { Link, Redirect } from "react-router-dom";
import { drizzleReactHooks } from "drizzle-react";
import TokenizedDerivative from "contracts/TokenizedDerivative.json";
import { formatWei, formatWithMaxDecimals } from "common/FormattingUtils";
import { useEtherscanUrl, useFaucetUrls } from "lib/custom-hooks";

import Header from "components/common/Header";
import Position from "components/Position";

const BigNumber = require("bignumber.js");

function usePositionList() {
  const { drizzle, useCacheCallPromise } = drizzleReactHooks.useDrizzle();
  const { web3 } = drizzle;
  const account = drizzleReactHooks.useDrizzleStatePromise((drizzleState, resolvePromise) => {
    if (drizzleState.accounts[0]) {
      resolvePromise(drizzleState.accounts[0]);
    }
  });

  const registeredContracts = useCacheCallPromise("Registry", "getRegisteredDerivatives", account);

  const finishedAddingContracts = drizzleReactHooks.useDrizzleStatePromise(
    (drizzleState, resolvePromise, registeredContractsResolved) => {
      let finished = true;

      for (const registeredContract of registeredContractsResolved) {
        const contractAddress = registeredContract.derivativeAddress;
        if (!drizzleState.contracts[contractAddress]) {
          finished = false;
          drizzle.addContract({
            contractName: contractAddress,
            web3Contract: new drizzle.web3.eth.Contract(TokenizedDerivative.abi, contractAddress)
          });
        }
      }

      if (finished) {
        resolvePromise(true);
      }
    },
    [registeredContracts]
  );

  const etherscanUrl = useEtherscanUrl();

  const positions = useCacheCallPromise(
    "NotApplicable",
    (
      contractCall,
      resolvePromise,
      registeredContractsResolved,
      accountResolved,
      etherscanPrefix,
      finishedAddingContracts
    ) => {
      let finished = true;

      const call = (contractName, methodName, ...args) => {
        const callResult = contractCall(contractName, methodName, ...args);
        if (callResult === undefined) {
          finished = false;
        }
        return callResult;
      };

      // Added a strange number as the fallback so it's obvious if this number ever makes it to the user.
      const formatTokenAmounts = valInWei =>
        valInWei ? formatWithMaxDecimals(formatWei(valInWei, web3), 4, false) : "-999999999";

      const positions = registeredContractsResolved.map(registeredContract => {
        const contractAddress = registeredContract.derivativeAddress;
        const name = call(contractAddress, "name");
        const totalSupply = formatTokenAmounts(call(contractAddress, "totalSupply"));
        const yourSupply = formatTokenAmounts(call(contractAddress, "balanceOf", accountResolved));
        const netPosition = BigNumber(yourSupply)
          .minus(BigNumber(totalSupply))
          .toString();
        return {
          address: {
            display: contractAddress,
            link: `${etherscanPrefix}/address/${contractAddress}`
          },
          tokenName: name,
          // TODO(mrice32): compute real liquidation price rather than hardcoding.
          liquidationPrice: "$14,000",
          exposures: [
            {
              type: "tokenFacility",
              items: {
                // TODO(mrice32): not sure if this is just the name of the token or the leverage + underlying.
                direction: `Short ${name}`,
                totalExposure: totalSupply,
                yourExposure: totalSupply
              }
            },
            {
              type: "tokens",
              items: {
                direction: `Long ${name}`,
                totalExposure: totalSupply,
                yourExposure: yourSupply
              }
            },
            {
              type: "netExposure",
              items: {
                direction: "Flat Risk",
                totalExposure: "",
                yourExposure: netPosition
              }
            }
          ]
        };
      });

      if (finished) {
        resolvePromise(positions);
      }
    },
    registeredContracts,
    account,
    etherscanUrl,
    finishedAddingContracts
  );

  drizzleReactHooks.useRerenderOnResolution(positions);

  return positions.isResolved ? positions.resolvedValue : undefined;
}

function ViewPositions() {
  const positions = usePositionList();
  const faucetUrls = useFaucetUrls();

  // TODO(mrice32): should we have some sort of loading screen to show while data is being pulled?
  if (positions === undefined) {
    return null;
  }

  // TODO(mrice32): potentially merge Start and ViewPositions pages to simplify.
  // Always redirect to the start screen if there are no positions.
  if (positions.length === 0) {
    return <Redirect to="/Start" />;
  }

  return (
    <div className="wrapper">
      <Header />

      <div className="main">
        <div className="shell">
          <section className="section section--intro section--intro-alt">
            <div className="section__actions">
              <Link to="/Steps" className="btn btn--size1">
                Open token facility
              </Link>

              <div className="section__actions-inner">
                {faucetUrls.eth ? (
                  <a
                    href={faucetUrls.eth}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn--grey btn--size1"
                  >
                    Testnet ETH faucet
                  </a>
                ) : null}

                {faucetUrls.dai ? (
                  <a
                    href={faucetUrls.dai}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn--grey btn--size1"
                  >
                    Testnet DAI faucet
                  </a>
                ) : null}
              </div>
            </div>

            <div className="section__content">
              <h2>Current risk exposure</h2>

              <div className="positions">
                {positions.map((position, pIdx, positionsArr) => {
                  return (
                    <Position
                      key={`position-${pIdx}`}
                      position={position}
                      index={pIdx}
                      totalLength={positionsArr.length}
                    />
                  );
                })}
              </div>
            </div>

            <div className="section__entry">
              <h2>Ready to create a new position?</h2>
            </div>

            <div className="section__actions">
              <Link to="/Steps" className="btn btn--size1">
                Open token facility
              </Link>
            </div>

            <div className="section__hint">
              <p>*You will need Testnet ETH and DAI before opening token facility</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default connect(
  state => ({
    landingPositions: state.positionsData.landingPositions
  }),
  {
    // fetchAllPositions
  }
)(ViewPositions);
