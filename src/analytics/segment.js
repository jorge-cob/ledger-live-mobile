// @flow
/* eslint-disable no-console */

import uuid from "uuid/v4";
import { Sentry } from "react-native-sentry";
import Config from "react-native-config";
import { Platform } from "react-native";
import analytics from "@segment/analytics-react-native";
import VersionNumber from "react-native-version-number";
import Locale from "react-native-locale";
import getOrCreateUser from "../user";
import { analyticsEnabledSelector } from "../reducers/settings";
import { knownDevicesSelector } from "../reducers/ble";
import type { State } from "../reducers";

const sessionId = uuid();

const appVersion = `${VersionNumber.appVersion ||
  ""} (${VersionNumber.buildVersion || ""})`;

const extraProperties = store => {
  const state: State = store.getState();
  const { localeIdentifier, preferredLanguages } = Locale.constants();
  const devices = knownDevicesSelector(state);
  return {
    appVersion,
    environment: ANALYTICS_LOGS ? "development" : "production",
    localeIdentifier,
    preferredLanguage: preferredLanguages ? preferredLanguages[0] : null,
    platformOS: Platform.OS,
    platformVersion: Platform.Version,
    sessionId,
    devicesCount: devices.length,
  };
};

let storeInstance; // is the redux store. it's also used as a flag to know if analytics is on or off.

const { ANALYTICS_LOGS, ANALYTICS_TOKEN } = Config;

const token = __DEV__ ? null : ANALYTICS_TOKEN;

export const start = async (store: *) => {
  if (token) {
    await analytics.setup(token, {
      android: {
        collectDeviceId: false,
      },
      ios: {
        trackAdvertising: false,
        trackDeepLinks: false,
      },
    });
  }

  const { user, created } = await getOrCreateUser();
  storeInstance = store;
  if (created) {
    if (ANALYTICS_LOGS) console.log("analytics:identify", user.id);
    if (token) {
      await analytics.reset();
      await analytics.identify(user.id, extraProperties(store));
    }
  }
  track("Start", extraProperties(store));
};

export const stop = () => {
  if (ANALYTICS_LOGS) console.log("analytics:stop");
  storeInstance = null;
};

export const track = (
  event: string,
  properties: ?Object,
  mandatory: ?boolean,
) => {
  Sentry.captureBreadcrumb({
    message: event,
    category: "track",
    data: properties,
    level: "debug",
  });

  if (
    !storeInstance ||
    (!mandatory && !analyticsEnabledSelector(storeInstance.getState()))
  ) {
    return;
  }
  if (ANALYTICS_LOGS) console.log("analytics:track", event, properties);
  if (!token) return;
  analytics.track(event, {
    ...extraProperties(storeInstance),
    ...properties,
  });
};

export const screen = (
  category: string,
  name: ?string,
  properties: ?Object,
) => {
  const title = category + (name ? " " + name : "");
  Sentry.captureBreadcrumb({
    message: title,
    category: "screen",
    data: properties,
    level: "info",
  });
  if (!storeInstance || !analyticsEnabledSelector(storeInstance.getState())) {
    return;
  }
  if (ANALYTICS_LOGS)
    console.log("analytics:screen", category, name, properties);
  if (!token) return;
  analytics.screen(title, {
    ...extraProperties(storeInstance),
    ...properties,
  });
};
