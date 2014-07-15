const self = require("sdk/self");
const { Cc, Ci, Cu, components } = require("chrome");

Cu.import("resource://gre/modules/AddonManager.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/Preferences.jsm");

const { PREFS } = require("prefs");
const { ByteTracker } = require("byteTracker");

const DEFAULT_PROXY_URL = "http://janus.allizom.org";
const PROXY_TYPE = 2;

var gUI = null;

function isFennec() {
  return (Services.appinfo.ID == "{aa3c5121-dab2-40e2-81ca-7ea25febc110}");
}

var ProxyAddon = {

  rebuildHeader: function() {
    this.header = "";

    var features = [
      { pref: PREFS.ADBLOCK_ENABLED, option: 'adblock' },
      { pref: PREFS.GIF2VIDEO_ENABLED, option: 'gif2video' },
      { pref: PREFS.FORK_ENABLED, option: 'fork' }
    ];

    features.forEach((feature) => {
      this.header += (Preferences.get(feature.pref, false) ? "+" +
        feature.option : "-" + feature.option) + " ";
    });
  },

  applyPrefChanges: function(name) {
    var value = Preferences.get(name);

    if (name === PREFS.ENABLED) {
      //updateUI(value);
      this.enabled = value;

      if (value) {
        Preferences.set(PREFS.PROXY_AUTOCONFIG_URL, Preferences.get(PREFS.PAC_URL));
        Preferences.set(PREFS.PROXY_TYPE, PROXY_TYPE);
        Services.obs.addObserver(ProxyAddon.observe, "http-on-modify-request", false);
        ByteTracker.start();
      } else {
        Preferences.reset(PREFS.PROXY_AUTOCONFIG_URL);
        Preferences.reset(PREFS.PROXY_TYPE);
        ByteTracker.stop();
        try {
          Services.obs.removeObserver(ProxyAddon.observe, "http-on-modify-request");
        } catch(e) {}
      }

      this.rebuildHeader();
    } else if (name === PREFS.PAC_URL) {
      Preferences.set(PREFS.PAC_URL, value);
    } else {
      this.rebuildHeader();
    }

    if (gUI.onPrefChanged) {
      gUI.onPrefChanged(name, value);
    }
  },

  observe: function(subject, topic, data) {
    if (topic === "nsPref:changed") {
      this.applyPrefChanges(data);
    } else if (topic === "http-on-modify-request") {
      let channel = subject.QueryInterface(Ci.nsIHttpChannel);

      channel.setRequestHeader("X-Janus-Options", ProxyAddon.header, false);
    }
  },

  observeAddon: function(doc, topic, id) {
    if (id !== self.id) {
      return;
    }

    function updateUsage() {
      let bytesLabel = doc.getElementById("bytes-label");
      let reductionLabel = doc.getElementById("reduction-label");
      let usage = ByteTracker.getUsages();

      bytesLabel.innerHTML = usage.totalEgress + " / " +
        usage.totalIngress + " (" + usage.totalUnknown +
        " not proxied)";

      reductionLabel.innerHTML = "reduced by " + usage.reductionPercentage;
    }

    let resetButton = doc.getElementById("reset-button");
    resetButton.innerHTML = "Reset";
    resetButton.addEventListener('click', function() {
      ByteTracker.reset();
      updateUsage();
    });

    updateUsage();
  }
}

const OBSERVE_PREFS = [PREFS.ENABLED, PREFS.PAC_URL,
                       PREFS.ADBLOCK_ENABLED, PREFS.GIF2VIDEO_ENABLED,
                       PREFS.FORK_ENABLED];

require("sdk/system/unload").when(function unload(reason) {
  if (reason == 'shutdown') {
    return;
  }

  OBSERVE_PREFS.forEach(function(pref) {
    Preferences.ignore(pref, ProxyAddon);
  });

  Services.obs.removeObserver(ProxyAddon.observeAddon, AddonManager.OPTIONS_NOTIFICATION_DISPLAYED);

  // Put proxy prefs back to defaults
  Preferences.reset(PREFS.PROXY_AUTOCONFIG_URL);
  Preferences.reset(PREFS.PROXY_TYPE);

  if (gUI.shutdown) {
    gUI.shutdown(reason);
  }
});

if (self.loadReason == 'install') {
  Preferences.set(PREFS.ENABLED, true);
  Preferences.set(PREFS.PAC_URL, DEFAULT_PROXY_URL);
}

OBSERVE_PREFS.forEach(function(pref) {
  Preferences.observe(pref, ProxyAddon);
});

Services.obs.addObserver(ProxyAddon.observeAddon, AddonManager.OPTIONS_NOTIFICATION_DISPLAYED, false);

if (isFennec()) {
  gUI = require("fennec");
} else {
  gUI = require("desktop");
}

ProxyAddon.applyPrefChanges(PREFS.ENABLED);