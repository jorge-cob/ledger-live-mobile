// @flow
/* eslint import/no-cycle: 0 */
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { createSelector } from "reselect";
import createCounterValues from "@ledgerhq/live-common/lib/countervalues";
import { listCryptoCurrencies } from "@ledgerhq/live-common/lib/currencies";
import type { CryptoCurrency } from "@ledgerhq/live-common/lib/types";
import {
  fetchExchangesForPairImplementation,
  fetchTickersByMarketcapImplementation,
  getDailyRatesImplementation,
} from "@ledgerhq/live-common/lib/countervalues/mock";
import Config from "react-native-config";
import { setExchangePairsAction } from "./actions/settings";
import { currenciesSelector } from "./reducers/accounts";
import {
  counterValueCurrencySelector,
  counterValueExchangeSelector,
  currencySettingsSelector,
  intermediaryCurrency,
} from "./reducers/settings";
import network from "./api/network";

const LEDGER_COUNTERVALUES_API = "https://countervalues.api.live.ledger.com";

const pairsSelector = createSelector(
  currenciesSelector,
  counterValueCurrencySelector,
  counterValueExchangeSelector,
  state => state,
  (currencies, counterValueCurrency, counterValueExchange, state) =>
    currencies.length === 0
      ? []
      : [
          {
            from: intermediaryCurrency,
            to: counterValueCurrency,
            exchange: counterValueExchange,
          },
        ].concat(
          currencies
            .filter(c => c.ticker !== intermediaryCurrency.ticker)
            .map(currency => ({
              from: currency,
              to: intermediaryCurrency,
              exchange: currencySettingsSelector(state, { currency }).exchange,
            })),
        ),
);

const addExtraPollingHooks = (schedulePoll, cancelPoll) => {
  let appIsActive = true;
  // assuming we are connected because we want to start polling when we go connected again
  let networkIsConnected = true;

  function handleAppStateChange(nextAppState: string) {
    if (nextAppState === "active") {
      appIsActive = true;
      // poll when coming back
      schedulePoll(2000);
    } else {
      appIsActive = false;
      cancelPoll();
    }
  }

  function handleConnectivityChange(isConnected: boolean) {
    if (isConnected && !networkIsConnected && appIsActive) {
      // poll when recovering a connection
      schedulePoll(3000);
    }
    networkIsConnected = isConnected;
  }

  AppState.addEventListener("change", handleAppStateChange);
  NetInfo.isConnected.addEventListener(
    "connectionChange",
    handleConnectivityChange,
  );

  return () => {
    AppState.removeEventListener("change", handleAppStateChange);
    NetInfo.isConnected.removeEventListener(
      "connectionChange",
      handleConnectivityChange,
    );
  };
};

// $FlowFixMe
const CounterValues = createCounterValues({
  log: __DEV__
    ? (...args) => console.log("CounterValues:", ...args) // eslint-disable-line no-console
    : undefined,
  getAPIBaseURL: () => LEDGER_COUNTERVALUES_API,
  storeSelector: state => state.countervalues,
  pairsSelector,
  setExchangePairsAction,
  addExtraPollingHooks,
  network,
  ...(Config.MOCK
    ? {
        getDailyRatesImplementation,
        fetchExchangesForPairImplementation,
        fetchTickersByMarketcapImplementation,
      }
    : {}),
});

type PC = Promise<CryptoCurrency[]>;

let sortCache;
let syncCache = listCryptoCurrencies(true).sort((a, b) =>
  a.name.localeCompare(b.name),
);

export const getFullListSortedCryptoCurrencies: () => PC = () => {
  if (!sortCache) {
    sortCache = CounterValues.fetchTickersByMarketcap().then(
      tickers => {
        const list = listCryptoCurrencies(true).slice(0);
        const prependList = [];
        tickers.forEach(ticker => {
          const item = list.find(c => c.ticker === ticker);
          if (item) {
            list.splice(list.indexOf(item), 1);
            prependList.push(item);
          }
        });
        const res = prependList.concat(list);
        syncCache = res;
        return res;
      },
      () => {
        sortCache = null; // reset the cache for the next time it comes here to "try again"
        return syncCache; // fallback on default sort
      },
    );
  }

  return sortCache;
};

export const getFullListSortedCryptoCurrenciesSync: () => CryptoCurrency[] = () =>
  syncCache;

// trigger the catch straight away
getFullListSortedCryptoCurrencies();

export default CounterValues;
