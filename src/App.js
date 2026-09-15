/* JKL Cartridge Webapp
 * Copyright (C) 2023 Sebastian Quilitz
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import React from 'react';
import Communication from './communication'
import AddNewRomModal from "./Components/AddNewRomModal";
import ConfirmationModal from './Components/ConfirmationModal';
import SavegameModal from './Components/SavegameModal';
import BattleScene from './Components/BattleScene';
import { Trash3Fill, Save2Fill } from "react-bootstrap-icons";
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';
// Imported rather than read from public/ so webpack emits a content-hashed
// filename; a CDN in front of the app cannot then serve a stale logo.
import jklLogo from './assets/jkl_small.png';

const FirmwareRepoURL = "https://github.com/jeremiahng11/picartfirmware";

const MinimumFirmwareVersion = [0, 5, 2];

function compareVersion(a, b) {
  for (var i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return a[i] < b[i] ? -1 : 1;
    }
  }
  return 0;
}

// Drawn rather than imported so it inherits currentColor and stays crisp at any
// size. shapeRendering keeps the edges hard instead of antialiased.
function PixelCartridge() {
  return (
    <svg className="pixcart" viewBox="0 0 12 14" shapeRendering="crispEdges" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M2 1h6l2 2v10H2z" />
      <rect x="4" y="3" width="4" height="4" fill="#fff" opacity="0.92" />
      <rect x="4" y="12" width="1" height="2" fill="currentColor" />
      <rect x="6" y="12" width="1" height="2" fill="currentColor" />
      <rect x="8" y="12" width="1" height="2" fill="currentColor" />
    </svg>
  );
}

function isElectron() {
  // Renderer process
  if (typeof window !== 'undefined' && typeof window.process === 'object' && window.process.type === 'renderer') {
    return true;
  }

  // Main process
  if (typeof process !== 'undefined' && typeof process.versions === 'object' && !!process.versions.electron) {
    return true;
  }

  // Detect the user agent when the `nodeIntegration` option is set to true
  if (typeof navigator === 'object' && typeof navigator.userAgent === 'string' && navigator.userAgent.indexOf('Electron') >= 0) {
    return true;
  }

  return false;
}

class GbCartridge extends React.Component {
  StateConnect = "Connect"; // Select USB device
  StateConnecting = "Connecting"; // Connect to USB device
  StateRetrievingInfo = "RetrievingInfo";
  StateConnected = "Connected";

  static defaultProps = {
    ReleasesURL: FirmwareRepoURL + "/releases",
    FirmwareCommitURL: FirmwareRepoURL + "/commit/",
    WebappReleasesURL: "https://github.com/jeremiahng11/picart"
  };

  state = {
    state: this.StateConnect,
    openAddRomModal: false,
    deviceInfo: {},
    serialId: null,
    buildName: null,
    romUtilization: { numRoms: 0, usedBanks: 0, maxBanks: 0 },
    romInfos: [],
    confirmationMessage: null,
    confirmationId: 0,
    showConfirmationModal: false,
    showSavegameModal: false,
    activeRomListItem: null,
    activeRomListInfo: null
  }

  componentDidMount() {
    if (navigator.usb) {
      navigator.usb.addEventListener('disconnect', this.handleUsbDisconnect);
    }
  }

  componentWillUnmount() {
    if (navigator.usb) {
      navigator.usb.removeEventListener('disconnect', this.handleUsbDisconnect);
    }
  }

  // Unplugging the cartridge previously left the UI in its connected state with
  // every subsequent command failing and no way back.
  handleUsbDisconnect = (event) => {
    if (!this.comm || event.device !== this.comm.device) {
      return;
    }

    console.log("Cartridge was disconnected");
    this.comm.close();
    this.comm = null;
    this.setState({ state: this.StateConnect });
    this.displayError("The cartridge was disconnected");
  }

  NewFirmwareNotification = () => {
    return (
      <div>
        New Firmware available.<br />
        <a target="_blank" rel="noopener noreferrer" href={this.props.ReleasesURL}>Check it out</a>
      </div>
    )
  }

  ConnectButtonHandler() {
    this.comm = new Communication();
    this.setState({
      state: this.StateConnecting
    });

    this.comm.getDevice().catch((first) => {
      // The browser may still hold permission for a device it can no longer
      // open, which is the state a disconnect can leave behind. Ask for one
      // rather than giving up.
      console.log("Reopening the granted device failed: " + first);
      this.comm = new Communication();
      return this.comm.getDevice(false);
    }).then(() => {
      console.log("Usb connected, updating status.");
      this.setState({
        state: this.StateRetrievingInfo
      });
      this.readDeviceStatus();
    }).catch(c => {
      console.log(c);
      this.comm = null;
      this.setState({
        state: this.StateConnect
      });

      // Choosing nothing in the picker is not a failure worth shouting about.
      if (c && c.name === "NotFoundError") {
        return;
      }
      this.displayError("Could not connect: " + ((c && c.message) || c));
    });
  }

  async readDeviceStatus() {
    console.log("Reading device info...");

    var deviceInfo = await this.comm.readDeviceInfoCommand();

    // The first command right after the interface opens occasionally does not
    // come back, which lands us on the 0.0.0 fallback. Give it one more go
    // before reporting the version as unknown.
    if (deviceInfo.unknown) {
      console.log("Device info read failed, retrying once...");
      await new Promise(resolve => setTimeout(resolve, 150));
      deviceInfo = await this.comm.readDeviceInfoCommand();
    }

    this.setState({ deviceInfo: deviceInfo });

    // Only prompt when the version was actually read. A failed read falls back
    // to 0.0.0, which would otherwise compare as older than the minimum and
    // prompt an upgrade on firmware that is already current.
    if (!deviceInfo.unknown && compareVersion(
      [deviceInfo.swVersion.major, deviceInfo.swVersion.minor, deviceInfo.swVersion.patch],
      MinimumFirmwareVersion) < 0) {
      setTimeout(() => {
        toast.info(this.NewFirmwareNotification, {
          position: "top-right",
          autoClose: 0,
          hideProgressBar: true,
          closeOnClick: true,
          draggable: false,
          progress: undefined,
          theme: "light",
        });
      }, 1000);
    }

    if (deviceInfo.featureStep > 4) {
      console.log("The cartridge firmware might be too new! (featureStep = " + deviceInfo.featureStep);
      setTimeout(() => {
        toast.warning("The cartridge firmware might be too new!", {
          position: "top-right",
          autoClose: 0,
          hideProgressBar: true,
          closeOnClick: true,
          draggable: false,
          progress: undefined,
          theme: "light",
        });
      }, 1000);
    }

    try {
      var buildName = await this.comm.readBuildNameCommand();
      console.log("buildName is " + buildName);
      this.setState({ buildName: buildName });
    }
    catch (e) {
      console.log("Was not able to read buildName (firmware older than 1.0.1?)");
    }

    try {
      var serialId = await this.comm.readDeviceSerialId();
      console.log("serialId is " + serialId);
      this.setState({ serialId: serialId });
    }
    catch (e) {
      console.log("Was not able to read serialId");
    }

    this.readRomUtilization();
  }

  async readRomUtilization() {
    console.log("Reading ROM utilization...");

    var romUtilization;
    try {
      romUtilization = await this.comm.readRomUtilizationCommand();
    }
    catch (e) {
      // Without this the rejection is unhandled and the app is stuck on
      // "Downloading Info..." with nothing shown to the user.
      console.log("Error reading rom utilization: " + e);
      await this.comm.close();
      this.comm = null;
      this.displayError("Could not read the cartridge. Please reconnect and try again.");
      this.setState({ state: this.StateConnect });
      return;
    }

    console.log("num Roms: " + romUtilization.numRoms);
    console.log("used banks: " + romUtilization.usedBanks);

    var romInfos = [];

    try {
      for (var rom = 0; rom < romUtilization.numRoms; rom++) {
        var romInfo = await this.comm.readRomInfoCommand(rom);
        console.log("Rom " + rom + ": " + romInfo.name);
        romInfos.push(romInfo);
      }
    }
    catch (e) {
      console.log("Error reading rominfo: " + e);
      toast.error("There was an error reading the rom info. Maybe the firmware of the cartridge is too new?", {
        position: "top-right",
        autoClose: false,
        hideProgressBar: true,
        closeOnClick: true,
        draggable: false,
        progress: undefined,
        theme: "light",
      });
    }

    this.setState({ state: this.StateConnected, romUtilization: romUtilization, romInfos: romInfos });
  }

  showDeleteConfirmationModal = (e) => {
    const id = Number(e.currentTarget.dataset.index);

    this.setState({ confirmationId: id, confirmationMessage: `Are you sure you want to delete '${this.state.romInfos[id].name}' and it's savegame?` });

    this.setState({ showConfirmationModal: true });
  };

  openSaveGameModal = (e) => {
    const id = Number(e.currentTarget.dataset.index);

    this.setState({ showSavegameModal: true, activeRomListInfo: this.state.romInfos[id] });
  };

  deleteRom = async (id) => {
    console.log("Deleting ROM " + id + " " + this.state.romInfos[id]);

    try {
      await this.comm.deleteRomCommand(id);
    }
    catch (e) {
      console.log("Deleting the ROM failed: " + e);
      this.hideConfirmationModal();
      this.displayError("Deleting the ROM failed");
      return;
    }

    this.hideConfirmationModal();

    toast.success("ROM deleted", {
      position: "top-right",
    });

    this.readDeviceStatus();
  };

  refreshDeviceStatus = async (uploadedName) => {
    if (uploadedName) {
      toast.success("\"" + uploadedName + "\" uploaded", {
        position: "top-right",
        autoClose: 4000,
        hideProgressBar: true,
        closeOnClick: true,
        draggable: false,
        progress: undefined,
        theme: "light",
      });
    }

    this.setState({ state: this.StateRetrievingInfo });

    this.readDeviceStatus();
  }

  displayError = (error) => {
    toast.error(error, {
      position: "top-right",
      autoClose: 0,
      hideProgressBar: true,
      closeOnClick: true,
      draggable: false,
      progress: undefined,
      theme: "light",
    });
  }

  // Lets go of the cartridge and returns to the connect screen, which is what
  // puts the game back on show.
  disconnect = async () => {
    if (this.comm) {
      await this.comm.close();
      this.comm = null;
    }

    this.setState({
      state: this.StateConnect,
      romInfos: [],
      romUtilization: { numRoms: 0, usedBanks: 0, maxBanks: 0 },
      deviceInfo: {},
      serialId: null,
      buildName: null,
    });

    // Said after the state change so it lands on the connect screen, which is
    // where the container that renders it lives.
    toast.info("Cartridge disconnected", {
      position: "top-right",
      autoClose: 2500,
      hideProgressBar: true,
      closeOnClick: true,
      draggable: false,
      progress: undefined,
      theme: "light",
    });
  }

  hideConfirmationModal = () => {
    this.setState({ showConfirmationModal: false });
  }

  // Every screen renders inside the cartridge label recess. Below the breakpoint
  // in App.css the shell is dropped and this collapses to a plain container.
  // solid covers the whole label, so the game behind it is hidden while the
  // cartridge is in hand.
  inCartridge(content, below, solid) {
    return (
      <div className="stage">
        <div className="cart">
          <div className="cart__label">
            {/* Sits outside the scrolling content so the sprites stay put
                while the rom list moves. */}
            <div className="scene" aria-hidden="true">
              <BattleScene covered={this.state.state === this.StateConnected} />
            </div>
            <div className={"cart__content" + (solid ? " is-solid" : "")}>
              {content}
            </div>
          </div>
        </div>
        {below && <div className="cart__below">{below}</div>}
      </div>
    );
  }

  romMeta(romInfo) {
    const parts = [];

    if (romInfo.numRomBanks !== 0) {
      parts.push(romInfo.numRomBanks + " banks");
    }
    if (romInfo.numRamBanks > 0) {
      parts.push(romInfo.numRamBanks + (romInfo.numRamBanks === 1 ? " RAM bank" : " RAM banks"));
    }
    if (romInfo.mbc !== 0xFF) {
      parts.push(romInfo.mbc === 0 ? "No MBC" : "MBC" + romInfo.mbc);
    }

    return parts.join(" \u00b7 ");
  }

  render() {
    if (!navigator.usb) {
      return this.inCartridge(
        <div className="app app--hero">
          <main className="hero">
            <img src={jklLogo} alt="JKL logo" className="hero__logo" />
            <h1 className="hero__title">Sorry, your browser does not support WebUSB!</h1>
            <p className="hero__lead">
              This app talks to the cartridge over WebUSB, which needs a Chromium
              browser such as Chrome or Edge, served over HTTPS.
            </p>
            <p className="hero__offline">
              Maybe you want to use the offline version which can be found{" "}
              <a target="_blank" rel="noopener noreferrer" href={this.props.WebappReleasesURL}>here</a>.
            </p>
          </main>
        </div>
      );
    }

    if (this.state.state === this.StateConnect) {
      return this.inCartridge(
        <div className="app app--hero">
          {/* Also the landing spot after a failed read, so errors raised while
              connecting have somewhere to render. */}
          <ToastContainer />
          <main className="hero">
            <img src={jklLogo} alt="JKL logo" className="hero__logo" />
            <h1 className="hero__title">JKL Gameboy Cartridge</h1>
            <p className="hero__lead">Connect your cartridge to manage its ROMs and savegames.</p>
            <button type="button" className="btn-jkl btn-jkl--lg" onClick={() => this.ConnectButtonHandler()}>
              Connect
            </button>
            <p className="hero__version">Version {process.env.REACT_APP_VERSION}</p>
          </main>
        </div>,
        !isElectron() && (
          <p className="cart__offline">
            Find the offline version{" "}
            <a target="_blank" rel="noopener noreferrer" href={this.props.WebappReleasesURL}>here</a>.
          </p>
        )
      );
    }

    if (this.state.state === this.StateConnecting || this.state.state === this.StateRetrievingInfo) {
      return this.inCartridge(
        <div className="app app--hero">
          <ToastContainer />
          <main className="hero">
            <span className="spinner" aria-hidden="true" />
            <p className="hero__status">
              {this.state.state === this.StateConnecting ? "Connecting to cartridge..." : "Reading cartridge..."}
            </p>
          </main>
        </div>
      );
    }

    if (this.state.state === this.StateConnected) {
      const used = this.state.romUtilization.usedBanks;
      const max = this.state.romUtilization.maxBanks;
      const free = max - used;
      const filled = max > 0 ? Math.min(100, (used / max) * 100) : 0;
      const sw = this.state.deviceInfo.swVersion;
      // Pad to 7 digits: the firmware reports the short SHA as a number, so a
      // hash with a leading zero (e.g. 0ffd383) would otherwise render and
      // link as ffd383, which GitHub cannot resolve.
      const gitShort = sw.gitShort.toString(16).padStart(7, "0");

      return this.inCartridge(
        <div className="app">
          <ToastContainer />

          <header className="topbar">
            <img src={jklLogo} alt="" className="topbar__logo" />
            <span className="topbar__name">JKL CARTRIDGE</span>
            <span className="topbar__version">v{process.env.REACT_APP_VERSION}</span>
            <button
              type="button"
              className="topbar__close"
              onClick={this.disconnect}
              title="Disconnect the cartridge"
              aria-label="Disconnect the cartridge"
            >
              X
            </button>
          </header>

          <main>
            <section className="panel">
              <div className="storage__head">
                <span className="storage__count">{used} / {max} banks</span>
                <span className="storage__free">{free} free</span>
              </div>
              <div
                className="meter"
                role="progressbar"
                aria-label="Cartridge storage used"
                aria-valuenow={used}
                aria-valuemin={0}
                aria-valuemax={max}
              >
                <div className="meter__fill" style={{ width: filled + "%" }} />
              </div>
            </section>

            <section className="roms">
              {this.state.romInfos.length === 0 ? (
                <p className="roms__empty">No ROMs on this cartridge yet.</p>
              ) : (
                this.state.romInfos.map((romInfo, idx) => (
                  <article className="rom" key={idx}>
                    <PixelCartridge />
                    <div className="rom__main">
                      <h3 className="rom__name">{romInfo.name}</h3>
                      <p className="rom__meta">{this.romMeta(romInfo)}</p>
                    </div>
                    <div className="rom__actions">
                      <button
                        type="button"
                        className="iconbtn"
                        title="Manage savegame"
                        aria-label={"Manage savegame for " + romInfo.name}
                        data-index={idx}
                        onClick={this.openSaveGameModal}
                        disabled={(romInfo.numRamBanks === 0) && (romInfo.mbc !== 2)}
                      >
                        <Save2Fill />
                      </button>
                      <button
                        type="button"
                        className="iconbtn iconbtn--danger"
                        title="Delete ROM"
                        aria-label={"Delete " + romInfo.name}
                        data-index={idx}
                        onClick={this.showDeleteConfirmationModal}
                      >
                        <Trash3Fill />
                      </button>
                    </div>
                  </article>
                ))
              )}
            </section>

            <button
              type="button"
              className="btn-jkl btn-jkl--block"
              onClick={() => { this.setState({ openAddRomModal: true }); }}
            >
              Add ROM
            </button>
          </main>

          <footer className="footer">
            <span>Firmware {sw.major}.{sw.minor}.{sw.patch} {sw.buildType}</span>
            <span className="footer__sep">&middot;</span>
            <a
              target="_blank"
              rel="noopener noreferrer"
              href={this.props.FirmwareCommitURL + gitShort}
            >
              {gitShort}
            </a>
            {this.state.buildName && (
              <span className="footer__buildname">{this.state.buildName}</span>
            )}
            {sw.gitDirty && <span className="footer__dirty">dirty</span>}
            {this.state.serialId && (
              <>
                <span className="footer__sep">&middot;</span>
                <span>Serial {this.state.serialId}</span>
              </>
            )}
          </footer>

          <AddNewRomModal show={this.state.openAddRomModal} onHide={() => { this.setState({ openAddRomModal: false }); }} onRomAdded={this.refreshDeviceStatus} onError={this.displayError} comm={this.comm} availableBanks={free} />
          <ConfirmationModal showModal={this.state.showConfirmationModal} confirmModal={this.deleteRom} hideModal={this.hideConfirmationModal} title="Delete confirmation" id={this.state.confirmationId} message={this.state.confirmationMessage} />
          <SavegameModal show={this.state.showSavegameModal} onHide={() => { this.setState({ showSavegameModal: false }); }} onError={this.displayError} comm={this.comm} romInfo={this.state.activeRomListInfo} />
        </div>,
        null,
        true
      );
    }

    return this.inCartridge(<div className="app">Invalid state {this.state.state}</div>);
  }
}

export default GbCartridge;
