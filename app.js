(() => {
  'use strict';

  const TRACKER_STORAGE_KEY = 'pilgrim_tracker_state_v3';
  const SELECTION_STORAGE_KEY = 'pilgrim_selection_v2';
  const WAZE_SYNC_STORAGE_KEY = 'pilgrim_waze_sync_v1';
  const WALKING_SPEED_KMH = 4.2;

  const STATE = {
    rootConfig: null,
    selectedSectionId: 'ww-trinity', // 'ww-trinity' | 'mapa-aon' | 'via-air'
    wwDioceses: [],
    selectedDioceseId: 'pl-krakow',
    nearestDiocese: null, // { diocese, meters }
    userPickedDioceseManually: false,
    dioceseRegionFilter: 'all',
    dioceseSearchQuery: '',
    stages: [],
    allPois: [],
    selectedStageId: 'all',
    isCustomGpx: false,
    customGpxName: '',
    activeFilter: 'all',
    activeLayer: 'osm',
    autoFollow: true,
    is3dView: false,
    cameraHeadingDeg: 0,
    sheetExpanded: false,
    userPosition: null,
    gpsError: null,
    watchId: null,
    selectedPoiIndex: -1,
    deferredInstallPrompt: null,
    installCardDismissed: false,
    isInstalled: false,
    isIOS: false,
    isCachingTiles: false,
    navigation: {
      active: false,
      voiceEnabled: true,
      lastSpokenKey: '',
      maneuvers: [],
      approachWaypoints: [],
      approachDistanceMeters: 0,
      offRouteDistanceMeters: 0,
      isOffRoute: false
    },
    waze: {
      autoSync: true,
      mode: 'next_poi', // 'next_poi' | 'day_end' | 'approach'
      waypointIndex: 0,
      currentUrl: 'https://www.waze.com/ul?navigate=yes',
      comapsUrl: 'https://comaps.at/',
      lastSyncedTargetName: ''
    },
    tracker: {
      status: 'idle',
      elapsedSec: 0,
      traveledMeters: 0,
      speedKmh: 0,
      recordedPoints: [],
      lastPoint: null,
      timerHandle: null
    }
  };

  // Capture beforeinstallprompt immediately so early Chromium events are never missed
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    STATE.deferredInstallPrompt = e;
  });

  let map = null;
  let osmLayer = null;
  let topoLayer = null;
  let stageLayerGroup = null;
  let approachLayerGroup = null;
  let recordedHaloLine = null;
  let recordedLine = null;
  let poiLayerGroup = null;
  let userMarker = null;
  let accuracyCircle = null;

  const els = {
    brandTitle: document.getElementById('brand-title'),
    offlineBanner: document.getElementById('offline-banner'),
    installBtn: document.getElementById('btn-install-pwa'),
    pwaInstallCard: document.getElementById('pwa-install-card'),
    pwaInstallSubtitle: document.getElementById('pwa-install-subtitle'),
    cardInstallBtn: document.getElementById('btn-card-install-pwa'),
    cardInstallLabel: document.getElementById('btn-card-install-label'),
    dismissInstallCardBtn: document.getElementById('btn-dismiss-install-card'),
    menuInstallBtn: document.getElementById('btn-menu-install'),
    menuInstallWrap: document.getElementById('menu-install-section'),
    menuBtn: document.getElementById('btn-open-menu'),
    mapStage: document.getElementById('map-stage'),
    mapHeadingRig: document.getElementById('map-heading-rig'),
    skyHorizonScrim: document.getElementById('sky-horizon-scrim'),
    guide3dOverlay: document.getElementById('guide-3d-overlay'),
    guide3dPointer: document.getElementById('guide-3d-pointer'),
    guide3dDirLabel: document.getElementById('guide-3d-dir-label'),
    guide3dDistLabel: document.getElementById('guide-3d-dist-label'),
    toggle3dBtn: document.getElementById('btn-toggle-3d'),
    labelToggle3d: document.getElementById('label-toggle-3d'),
    navHud: document.getElementById('nav-hud'),
    navArrowBox: document.getElementById('nav-arrow-box'),
    navManeuverDist: document.getElementById('nav-maneuver-dist'),
    navOffrouteTag: document.getElementById('nav-offroute-tag'),
    navManeuverText: document.getElementById('nav-maneuver-text'),
    navHudEta: document.getElementById('nav-hud-eta'),
    voiceToggleBtn: document.getElementById('btn-voice-toggle'),
    iconVoiceOn: document.getElementById('icon-voice-on'),
    iconVoiceOff: document.getElementById('icon-voice-off'),
    hudWazeLink: document.getElementById('link-hud-waze'),
    hudCoMapsLink: document.getElementById('link-hud-comaps'),
    stopNavBtn: document.getElementById('btn-stop-nav'),
    layerSwitch: document.getElementById('map-layer-switch'),
    layerOsmBtn: document.getElementById('btn-layer-osm'),
    layerTopoBtn: document.getElementById('btn-layer-topo'),
    centerMeBtn: document.getElementById('btn-center-me'),
    fitRouteBtn: document.getElementById('btn-fit-route'),
    poiSheet: document.getElementById('poi-sheet'),
    sheetHandleZone: document.getElementById('sheet-handle-zone'),
    sheetExpandBtn: document.getElementById('btn-toggle-sheet'),
    sheetExpandLabel: document.getElementById('sheet-expand-label'),
    statAccuracy: document.getElementById('stat-accuracy'),
    statTraveled: document.getElementById('stat-traveled'),
    statElapsed: document.getElementById('stat-elapsed'),
    statNearestDist: document.getElementById('stat-nearest-dist'),
    nearestPoiLine: document.getElementById('nearest-poi-line'),
    gpsWarningBox: document.getElementById('gps-warning-box'),
    sectionSelector: document.getElementById('section-selector'),
    activeAppCode: document.getElementById('active-app-code'),
    wwTrinityPanel: document.getElementById('ww-trinity-panel'),
    nearestDioceseName: document.getElementById('nearest-diocese-name'),
    nearestDioceseMeta: document.getElementById('nearest-diocese-meta'),
    pickNearestDioceseBtn: document.getElementById('btn-pick-nearest-diocese'),
    detectGpsDioceseBtn: document.getElementById('btn-detect-gps-diocese'),
    dioceseSearch: document.getElementById('diocese-search'),
    dioceseRegionBar: document.getElementById('diocese-region-bar'),
    dioceseSelect: document.getElementById('diocese-select'),
    stageSelector: document.getElementById('stage-selector'),
    routeTitle: document.getElementById('route-title'),
    routeMeta: document.getElementById('route-meta'),
    routeDesc: document.getElementById('route-desc'),
    startDayNavBtn: document.getElementById('btn-start-day-nav'),
    routeApproachBtn: document.getElementById('btn-route-approach'),
    approachStatus: document.getElementById('approach-status'),
    wazeSyncPanel: document.getElementById('waze-sync-panel'),
    wazeSyncStatus: document.getElementById('waze-sync-status'),
    wazeAutoSyncBtn: document.getElementById('btn-waze-autosync'),
    wazeModeBar: document.getElementById('waze-mode-bar'),
    wazeStepCounter: document.getElementById('waze-step-counter'),
    wazeTargetName: document.getElementById('waze-target-name'),
    wazeTargetCoords: document.getElementById('waze-target-coords'),
    wazeStepControls: document.getElementById('waze-step-controls'),
    wazePrevBtn: document.getElementById('btn-waze-prev'),
    wazeNextBtn: document.getElementById('btn-waze-next'),
    wazeOpenLink: document.getElementById('link-waze-open'),
    comapsOpenLink: document.getElementById('link-comaps-open'),
    wazeCopyBtn: document.getElementById('btn-waze-copy'),
    comapsCopyBtn: document.getElementById('btn-comaps-copy'),
    maneuversCount: document.getElementById('maneuvers-count'),
    maneuversList: document.getElementById('maneuvers-list'),
    trackerStateText: document.getElementById('tracker-state-text'),
    trackerSpeed: document.getElementById('tracker-speed'),
    trackerProgress: document.getElementById('tracker-progress'),
    trackerPointsCount: document.getElementById('tracker-points-count'),
    trackerToggleBtn: document.getElementById('btn-tracker-toggle'),
    trackerExportBtn: document.getElementById('btn-tracker-export'),
    trackerResetBtn: document.getElementById('btn-tracker-reset'),
    filterBar: document.getElementById('poi-filter-bar'),
    poiList: document.getElementById('poi-list'),
    poiModal: document.getElementById('poi-modal'),
    poiModalKicker: document.getElementById('poi-modal-kicker'),
    poiModalTitle: document.getElementById('poi-modal-title'),
    poiModalDesc: document.getElementById('poi-modal-desc'),
    poiModalPrayerBox: document.getElementById('poi-modal-prayer-box'),
    poiModalPrayerTitle: document.getElementById('poi-modal-prayer-title'),
    poiModalPrayerText: document.getElementById('poi-modal-prayer-text'),
    poiModalClose: document.getElementById('btn-poi-close'),
    poiModalLocate: document.getElementById('btn-poi-locate'),
    poiModalWazeLink: document.getElementById('link-poi-waze'),
    poiModalCoMapsLink: document.getElementById('link-poi-comaps'),
    poiModalNext: document.getElementById('btn-poi-next'),
    menuModal: document.getElementById('menu-modal'),
    menuModalClose: document.getElementById('btn-menu-close'),
    exportGpxBtn: document.getElementById('btn-export-gpx'),
    importGpxInput: document.getElementById('input-import-gpx'),
    resetRouteBtn: document.getElementById('btn-reset-route'),
    cacheTilesBtn: document.getElementById('btn-cache-tiles'),
    clearTilesBtn: document.getElementById('btn-clear-tiles'),
    tileCacheStatus: document.getElementById('tile-cache-status'),
    tileProgressWrap: document.getElementById('tile-progress-wrap'),
    tileProgressFill: document.getElementById('tile-progress-fill'),
    iosModal: document.getElementById('ios-modal'),
    iosModalKicker: document.getElementById('ios-modal-kicker'),
    iosModalTitle: document.getElementById('ios-modal-title'),
    iosModalBody: document.getElementById('ios-modal-body'),
    iosModalClose: document.getElementById('btn-ios-close'),
    iosModalOk: document.getElementById('btn-ios-ok'),
    navFitBtn: document.getElementById('nav-fit-route'),
    navExportBtn: document.getElementById('nav-export-gpx'),
    navOfflineBtn: document.getElementById('nav-offline-tools')
  };

  const CATEGORY_META = {
    start_meta: {
      label: 'Start / Meta',
      svg: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>'
    },
    church: {
      label: 'Kościół / Sanktuarium',
      svg: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v5"/><path d="M9.5 4.5h5"/><path d="M4 22V12l8-5 8 5v10"/><path d="M10 22v-5a2 2 0 0 1 4 0v5"/></svg>'
    },
    water: {
      label: 'Postój / Woda',
      svg: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>'
    },
    accommodation: {
      label: 'Nocleg',
      svg: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/></svg>'
    },
    medical: {
      label: 'Punkt Medyczny',
      svg: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>'
    }
  };

  const MANEUVER_ARROWS = {
    straight: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>',
    slight_left: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><line x1="17" y1="17" x2="7" y2="7"/><polyline points="7 15 7 7 15 7"/></svg>',
    left: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 20v-7a3 3 0 0 0-3-3H5"/><polyline points="10 5 5 10 10 15"/></svg>',
    slight_right: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="9 7 17 7 17 15"/></svg>',
    right: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 20v-7a3 3 0 0 1 3-3h7"/><polyline points="14 5 19 10 14 15"/></svg>',
    uturn: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/></svg>',
    finish: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>'
  };

  function getCategoryInfo(cat) {
    return CATEGORY_META[cat] || CATEGORY_META.start_meta;
  }

  // --- GEOMETRY, BEARING & FORMATTING ---
  function haversineMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function computeBearingDeg(lat1, lon1, lat2, lon2) {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const toDeg = (rad) => (rad * 180) / Math.PI;
    const f1 = toRad(lat1);
    const f2 = toRad(lat2);
    const dLon = toRad(lon2 - lon1);
    const y = Math.sin(dLon) * Math.cos(f2);
    const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dLon);
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
  }

  function normalizeAngleDelta(deg) {
    let d = ((deg % 360) + 360) % 360;
    if (d > 180) d -= 360;
    return d;
  }

  function compassDirectionPl(deg) {
    const dirs = ['północ', 'północny wschód', 'wschód', 'południowy wschód', 'południe', 'południowy zachód', 'zachód', 'północny zachód'];
    return dirs[Math.round(deg / 45) % 8];
  }

  function compassShort(deg) {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return dirs[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
  }

  function computePolylineMeters(points) {
    if (!points || points.length < 2) return 0;
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      total += haversineMeters(points[i - 1][0], points[i - 1][1], points[i][0], points[i][1]);
    }
    return total;
  }

  function formatDistance(meters) {
    if (meters == null || Number.isNaN(meters)) return '—';
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(2)} km`;
  }

  function formatDuration(totalSeconds) {
    const sec = Math.max(0, Math.floor(totalSeconds || 0));
    const h = String(Math.floor(sec / 3600)).padStart(2, '0');
    const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  function formatEtaClock(minutesRemaining) {
    const arrival = new Date(Date.now() + minutesRemaining * 60000);
    return arrival.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  }

  function formatWalkingDuration(meters) {
    const hours = meters / 1000 / WALKING_SPEED_KMH;
    const totalMin = Math.max(1, Math.round(hours * 60));
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h === 0) return `ok. ${m} min`;
    return `ok. ${h} h ${String(m).padStart(2, '0')} min`;
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeXml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  function projectPointOntoRoute(userPos, waypoints) {
    if (!userPos || !waypoints || waypoints.length < 2) {
      return {
        offRouteMeters: 0,
        alongMeters: 0,
        totalMeters: 0,
        nearestLatLng: null,
        segmentIndex: 0,
        progressPct: 0
      };
    }

    let totalLen = 0;
    const segStarts = [0];
    for (let i = 1; i < waypoints.length; i++) {
      totalLen += haversineMeters(
        waypoints[i - 1][0],
        waypoints[i - 1][1],
        waypoints[i][0],
        waypoints[i][1]
      );
      segStarts.push(totalLen);
    }
    if (totalLen <= 0) {
      return { offRouteMeters: 0, alongMeters: 0, totalMeters: 0, nearestLatLng: waypoints[0], segmentIndex: 0, progressPct: 0 };
    }

    let bestDist = Infinity;
    let bestAlong = 0;
    let bestPt = waypoints[0];
    let bestSegIdx = 0;

    for (let i = 0; i < waypoints.length - 1; i++) {
      const a = waypoints[i];
      const b = waypoints[i + 1];
      const dx = b[1] - a[1];
      const dy = b[0] - a[0];
      const lenSq = dx * dx + dy * dy;
      let t = 0;
      if (lenSq > 0) {
        t = ((userPos.lng - a[1]) * dx + (userPos.lat - a[0]) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
      }
      const projLat = a[0] + t * dy;
      const projLng = a[1] + t * dx;
      const d = haversineMeters(userPos.lat, userPos.lng, projLat, projLng);
      if (d < bestDist) {
        bestDist = d;
        const segLen = segStarts[i + 1] - segStarts[i];
        bestAlong = segStarts[i] + t * segLen;
        bestPt = [projLat, projLng];
        bestSegIdx = i;
      }
    }

    return {
      offRouteMeters: bestDist,
      alongMeters: bestAlong,
      totalMeters: totalLen,
      nearestLatLng: bestPt,
      segmentIndex: bestSegIdx,
      progressPct: Math.max(0, Math.min(100, Math.round((bestAlong / totalLen) * 100)))
    };
  }

  // --- TURN-BY-TURN MANEUVER BUILDER ---
  function buildTurnStepsForDay(waypoints, pois) {
    if (!waypoints || waypoints.length < 2) return [];

    const steps = [];
    let cumulative = 0;
    const firstBearing = computeBearingDeg(waypoints[0][0], waypoints[0][1], waypoints[1][0], waypoints[1][1]);

    const findNearPoi = (lat, lng) => {
      let best = null;
      let bestD = 300;
      for (const p of pois) {
        const d = haversineMeters(lat, lng, p.lat, p.lng);
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
      return best;
    };

    const startPoi = findNearPoi(waypoints[0][0], waypoints[0][1]);
    steps.push({
      type: 'straight',
      alongMeters: 0,
      lat: waypoints[0][0],
      lng: waypoints[0][1],
      text: startPoi
        ? `Ruszaj na ${compassDirectionPl(firstBearing)} spod: ${startPoi.name}`
        : `Idź prosto na ${compassDirectionPl(firstBearing)} wyznaczoną ścieżką`
    });

    for (let i = 1; i < waypoints.length - 1; i++) {
      cumulative += haversineMeters(
        waypoints[i - 1][0],
        waypoints[i - 1][1],
        waypoints[i][0],
        waypoints[i][1]
      );

      const bIn = computeBearingDeg(waypoints[i - 1][0], waypoints[i - 1][1], waypoints[i][0], waypoints[i][1]);
      const bOut = computeBearingDeg(waypoints[i][0], waypoints[i][1], waypoints[i + 1][0], waypoints[i + 1][1]);
      const delta = normalizeAngleDelta(bOut - bIn);
      const absDelta = Math.abs(delta);
      const nearPoi = findNearPoi(waypoints[i][0], waypoints[i][1]);

      if (absDelta >= 18 || nearPoi) {
        let type = 'straight';
        let action = 'Kontynuuj prosto';

        if (absDelta >= 135) {
          type = 'uturn';
          action = delta > 0 ? 'Ostro w prawo' : 'Ostro w lewo';
        } else if (absDelta >= 48) {
          type = delta > 0 ? 'right' : 'left';
          action = delta > 0 ? 'Skręć w prawo' : 'Skręć w lewo';
        } else if (absDelta >= 18) {
          type = delta > 0 ? 'slight_right' : 'slight_left';
          action = delta > 0 ? 'Trzymaj się lekko prawej' : 'Trzymaj się lekko lewej';
        }

        const lastStep = steps[steps.length - 1];
        if (cumulative - lastStep.alongMeters >= 150 || nearPoi) {
          steps.push({
            type,
            alongMeters: cumulative,
            lat: waypoints[i][0],
            lng: waypoints[i][1],
            text: nearPoi ? `${action} przy: ${nearPoi.name}` : `${action} w stronę: ${compassDirectionPl(bOut)}`
          });
        }
      }
    }

    const lastPt = waypoints[waypoints.length - 1];
    const prevPt = waypoints[waypoints.length - 2];
    cumulative += haversineMeters(prevPt[0], prevPt[1], lastPt[0], lastPt[1]);
    const endPoi = findNearPoi(lastPt[0], lastPt[1]);

    steps.push({
      type: 'finish',
      alongMeters: cumulative,
      lat: lastPt[0],
      lng: lastPt[1],
      text: endPoi ? `Cel dnia: ${endPoi.name}` : 'Koniec wyznaczonej ścieżki dnia'
    });

    return steps;
  }

  // --- ACTIVE SECTION / DIOCESE / STAGE HELPERS ---
  function getActiveSectionObj() {
    return STATE.rootConfig?.sections?.[STATE.selectedSectionId] || null;
  }

  function getSelectedDioceseObj() {
    return STATE.wwDioceses.find((d) => d.id === STATE.selectedDioceseId) || STATE.wwDioceses[0] || null;
  }

  function getActiveStages() {
    if (STATE.selectedStageId === 'all') return STATE.stages;
    const match = STATE.stages.find((s) => s.id === STATE.selectedStageId);
    return match ? [match] : STATE.stages;
  }

  function getNavigationTargetStage() {
    if (STATE.selectedStageId !== 'all') {
      return STATE.stages.find((s) => s.id === STATE.selectedStageId) || STATE.stages[0] || null;
    }
    return STATE.stages[0] || null;
  }

  function getActiveWaypointsCombined() {
    const active = getActiveStages();
    const pts = [];
    active.forEach((stage) => {
      if (Array.isArray(stage.waypoints)) {
        stage.waypoints.forEach((pt) => pts.push(pt));
      }
    });
    return pts;
  }

  function getStagePois() {
    if (STATE.selectedStageId === 'all') return STATE.allPois;
    return STATE.allPois.filter((poi) => {
      if (Array.isArray(poi.stageIds)) {
        return poi.stageIds.includes(STATE.selectedStageId);
      }
      if (poi.stageId) {
        return poi.stageId === STATE.selectedStageId;
      }
      return true;
    });
  }

  // --- MAP INITIALIZATION ---
  function initMap() {
    map = L.map('map', {
      zoomControl: false,
      attributionControl: true
    }).setView([50.0614, 19.9366], 12);

    L.control.zoom({ position: 'bottomleft' }).addTo(map);
    L.control.scale({ imperial: false, metric: true, position: 'bottomleft' }).addTo(map);

    osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      crossOrigin: true,
      attribution: '&copy; OpenStreetMap'
    });

    topoLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      maxZoom: 17,
      crossOrigin: true,
      attribution: '&copy; OpenTopoMap (CC-BY-SA)'
    });

    osmLayer.addTo(map);
    stageLayerGroup = L.layerGroup().addTo(map);
    approachLayerGroup = L.layerGroup().addTo(map);
    poiLayerGroup = L.layerGroup().addTo(map);

    map.on('dragstart', () => {
      if (STATE.autoFollow) {
        setAutoFollow(false);
      }
    });
  }

  function switchBaseLayer(layerKey) {
    if (!map) return;
    STATE.activeLayer = layerKey;
    if (layerKey === 'topo') {
      if (map.hasLayer(osmLayer)) map.removeLayer(osmLayer);
      if (!map.hasLayer(topoLayer)) topoLayer.addTo(map);
      els.layerTopoBtn.classList.add('is-active');
      els.layerTopoBtn.setAttribute('aria-pressed', 'true');
      els.layerOsmBtn.classList.remove('is-active');
      els.layerOsmBtn.setAttribute('aria-pressed', 'false');
    } else {
      if (map.hasLayer(topoLayer)) map.removeLayer(topoLayer);
      if (!map.hasLayer(osmLayer)) osmLayer.addTo(map);
      els.layerOsmBtn.classList.add('is-active');
      els.layerOsmBtn.setAttribute('aria-pressed', 'true');
      els.layerTopoBtn.classList.remove('is-active');
      els.layerTopoBtn.setAttribute('aria-pressed', 'false');
    }
  }

  // --- 3D VIEW & DESTINATION GUIDE INDICATOR (WAZE / NAVIEXPERT STYLE) ---
  function set3dView(enabled) {
    STATE.is3dView = enabled;
    els.mapStage.classList.toggle('is-3d-mode', enabled);
    els.skyHorizonScrim.classList.toggle('hidden', !enabled);
    els.guide3dOverlay.classList.toggle('hidden', !enabled);
    els.toggle3dBtn.classList.toggle('is-active', enabled);
    els.toggle3dBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    els.labelToggle3d.textContent = enabled ? 'Widok 2D' : 'Widok 3D';

    if (enabled) {
      if (STATE.userPosition && map) {
        map.setView([STATE.userPosition.lat, STATE.userPosition.lng], Math.max(map.getZoom(), 15), {
          animate: false
        });
      }
      update3dGuideAndHeading();
    } else {
      els.mapHeadingRig.style.transform = '';
    }

    // Recalculate Leaflet container dimensions smoothly after CSS resize
    setTimeout(() => {
      if (map) map.invalidateSize({ animate: false });
    }, 340);
  }

  function update3dGuideAndHeading() {
    if (!STATE.is3dView) return;

    const targetStage = getNavigationTargetStage();
    const waypoints = targetStage?.waypoints || [];
    const endPoint = waypoints[waypoints.length - 1];

    let cameraHeading = STATE.cameraHeadingDeg;
    let targetPoint = endPoint ? { lat: endPoint[0], lng: endPoint[1] } : null;
    let distToTarget = 0;

    if (STATE.userPosition && waypoints.length >= 2) {
      const proj = projectPointOntoRoute(STATE.userPosition, waypoints);
      const nextWpIdx = Math.min(waypoints.length - 1, proj.segmentIndex + 1);
      const nextWp = waypoints[nextWpIdx];

      // If GPS supplies movement heading while walking, use it; otherwise orient along trail toward next waypoint
      if (
        STATE.userPosition.heading != null &&
        !Number.isNaN(STATE.userPosition.heading) &&
        STATE.tracker.speedKmh > 1.2
      ) {
        cameraHeading = STATE.userPosition.heading;
      } else if (proj.offRouteMeters > 75 && proj.nearestLatLng) {
        cameraHeading = computeBearingDeg(
          STATE.userPosition.lat,
          STATE.userPosition.lng,
          proj.nearestLatLng[0],
          proj.nearestLatLng[1]
        );
      } else if (nextWp) {
        cameraHeading = computeBearingDeg(
          STATE.userPosition.lat,
          STATE.userPosition.lng,
          nextWp[0],
          nextWp[1]
        );
      }

      if (proj.offRouteMeters > 75 && proj.nearestLatLng) {
        targetPoint = { lat: proj.nearestLatLng[0], lng: proj.nearestLatLng[1] };
        distToTarget = proj.offRouteMeters;
      } else if (endPoint) {
        targetPoint = { lat: endPoint[0], lng: endPoint[1] };
        distToTarget = Math.max(0, proj.totalMeters - proj.alongMeters);
      }
    } else if (waypoints.length >= 2) {
      cameraHeading = computeBearingDeg(waypoints[0][0], waypoints[0][1], waypoints[1][0], waypoints[1][1]);
      distToTarget = computePolylineMeters(waypoints);
    }

    STATE.cameraHeadingDeg = cameraHeading;
    els.mapHeadingRig.style.transform = `rotateZ(${-cameraHeading.toFixed(1)}deg)`;

    // Compute relative pointer angle toward the destination / next target
    let targetBearing = cameraHeading;
    if (STATE.userPosition && targetPoint) {
      targetBearing = computeBearingDeg(
        STATE.userPosition.lat,
        STATE.userPosition.lng,
        targetPoint.lat,
        targetPoint.lng
      );
    } else if (waypoints.length >= 2 && endPoint) {
      targetBearing = computeBearingDeg(waypoints[0][0], waypoints[0][1], endPoint[0], endPoint[1]);
    }

    const relDelta = normalizeAngleDelta(targetBearing - cameraHeading);
    els.guide3dPointer.style.transform = `rotate(${relDelta.toFixed(1)}deg)`;

    let dirWord = 'Prosto do celu';
    if (Math.abs(relDelta) > 135) dirWord = 'Cel za Tobą (zawróć)';
    else if (relDelta > 45) dirWord = 'Cel po prawej';
    else if (relDelta > 15) dirWord = 'Cel lekko w prawo';
    else if (relDelta < -45) dirWord = 'Cel po lewej';
    else if (relDelta < -15) dirWord = 'Cel lekko w lewo';

    els.guide3dDirLabel.textContent = dirWord;
    els.guide3dDistLabel.textContent = `${formatDistance(distToTarget)} · ${Math.round(targetBearing)}° ${compassShort(targetBearing)}`;
  }

  // --- WW TRINITY NEAREST DIOCESE DETECTION & CATALOG ---
  function findNearestDiocese(userPos) {
    if (!userPos || STATE.wwDioceses.length === 0) return null;
    let best = null;
    let bestMeters = Infinity;
    for (const d of STATE.wwDioceses) {
      const dist = haversineMeters(userPos.lat, userPos.lng, d.lat, d.lng);
      if (dist < bestMeters) {
        bestMeters = dist;
        best = { diocese: d, meters: dist };
      }
    }
    return best;
  }

  function updateNearestDioceseRecommendation(autoSwitchIfFirstLock = false) {
    if (!STATE.userPosition || STATE.wwDioceses.length === 0) {
      els.nearestDioceseName.textContent = STATE.gpsError
        ? 'Brak sygnału GPS'
        : 'Ustalanie pozycji GPS...';
      els.nearestDioceseMeta.textContent = STATE.gpsError
        ? 'Włącz lokalizację lub wybierz diecezję ręcznie z listy poniżej.'
        : 'Po uzyskaniu pozycji automatycznie wskażemy najbliższą diecezję WW Trinity.';
      els.pickNearestDioceseBtn.classList.add('hidden');
      return;
    }

    const nearest = findNearestDiocese(STATE.userPosition);
    STATE.nearestDiocese = nearest;
    if (!nearest) return;

    const d = nearest.diocese;
    els.nearestDioceseName.textContent = `${d.name} (${formatDistance(nearest.meters)})`;
    els.nearestDioceseMeta.textContent = `${d.city}, ${d.country} · Pętla ok. ${d.estimatedLoopKm} km`;

    if (
      autoSwitchIfFirstLock &&
      !STATE.userPickedDioceseManually &&
      STATE.selectedSectionId === 'ww-trinity' &&
      STATE.selectedDioceseId !== d.id
    ) {
      selectWwTrinityDiocese(d.id, false);
    }

    const alreadySelected = STATE.selectedSectionId === 'ww-trinity' && STATE.selectedDioceseId === d.id;
    els.pickNearestDioceseBtn.classList.toggle('hidden', alreadySelected);
    renderDioceseOptions();
  }

  function renderDioceseOptions() {
    const query = STATE.dioceseSearchQuery.trim().toLowerCase();
    const region = STATE.dioceseRegionFilter;

    let filtered = STATE.wwDioceses.filter((d) => {
      if (region !== 'all' && d.region !== region) return false;
      if (!query) return true;
      return (
        d.name.toLowerCase().includes(query) ||
        d.city.toLowerCase().includes(query) ||
        d.country.toLowerCase().includes(query)
      );
    });

    // Sort by distance from user GPS when available!
    if (STATE.userPosition) {
      filtered = [...filtered].sort((a, b) => {
        const da = haversineMeters(STATE.userPosition.lat, STATE.userPosition.lng, a.lat, a.lng);
        const db = haversineMeters(STATE.userPosition.lat, STATE.userPosition.lng, b.lat, b.lng);
        return da - db;
      });
    }

    if (filtered.length === 0) {
      els.dioceseSelect.innerHTML = '<option value="">Brak pasujących diecezji</option>';
      return;
    }

    els.dioceseSelect.innerHTML = filtered
      .map((d) => {
        const distPart = STATE.userPosition
          ? ` — ${formatDistance(haversineMeters(STATE.userPosition.lat, STATE.userPosition.lng, d.lat, d.lng))}`
          : '';
        const selectedAttr = d.id === STATE.selectedDioceseId ? 'selected' : '';
        return `<option value="${escapeHtml(d.id)}" ${selectedAttr}>${escapeHtml(d.name)} (${escapeHtml(d.city)})${escapeHtml(distPart)}</option>`;
      })
      .join('');
  }

  // --- SECTION & DIOCESE SELECTION ---
  function renderSectionSelector() {
    els.sectionSelector.querySelectorAll('.pilgrimage-btn').forEach((btn) => {
      const id = btn.getAttribute('data-section-id');
      const isActive = !STATE.isCustomGpx && id === STATE.selectedSectionId;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    els.wwTrinityPanel.classList.toggle('hidden', STATE.isCustomGpx || STATE.selectedSectionId !== 'ww-trinity');
    els.activeAppCode.textContent = STATE.isCustomGpx ? 'GPX' : STATE.selectedSectionId;
  }

  function renderStageSelector() {
    if (STATE.stages.length === 0) {
      els.stageSelector.innerHTML = '';
      return;
    }

    const allBtn = `
      <button
        type="button"
        class="stage-btn ${STATE.selectedStageId === 'all' ? 'is-active' : ''}"
        data-stage-id="all"
        aria-pressed="${STATE.selectedStageId === 'all' ? 'true' : 'false'}"
      >
        <span>Wszystkie (${STATE.stages.length})</span>
      </button>
    `;

    const stageBtns = STATE.stages
      .map((stage) => {
        const isActive = STATE.selectedStageId === stage.id;
        return `
          <button
            type="button"
            class="stage-btn ${isActive ? 'is-active' : ''}"
            data-stage-id="${escapeHtml(stage.id)}"
            aria-pressed="${isActive ? 'true' : 'false'}"
          >
            <span class="stage-swatch" style="background-color: ${escapeHtml(stage.color || '#065F46')};" aria-hidden="true"></span>
            <span>${escapeHtml(stage.shortLabel || stage.name)}</span>
          </button>
        `;
      })
      .join('');

    els.stageSelector.innerHTML = STATE.stages.length > 1 ? allBtn + stageBtns : stageBtns;
  }

  function renderRouteAndPois(shouldFit = true) {
    if (!map) return;

    stageLayerGroup.clearLayers();
    poiLayerGroup.clearLayers();

    const section = getActiveSectionObj();
    STATE.stages.forEach((stage) => {
      if (!stage.waypoints || stage.waypoints.length < 2) return;
      const isSelected = STATE.selectedStageId === 'all' || STATE.selectedStageId === stage.id;
      const color = stage.color || section?.accentColor || '#065F46';

      if (isSelected) {
        L.polyline(stage.waypoints, {
          color: '#ffffff',
          weight: 9,
          opacity: 0.92,
          lineJoin: 'round',
          lineCap: 'round'
        }).addTo(stageLayerGroup);

        const activeLine = L.polyline(stage.waypoints, {
          color,
          weight: 5,
          opacity: 0.98,
          lineJoin: 'round',
          lineCap: 'round'
        }).addTo(stageLayerGroup);

        activeLine.on('click', () => {
          if (STATE.stages.length > 1 && STATE.selectedStageId === 'all') {
            selectStage(stage.id);
          }
        });
      } else {
        const ghostLine = L.polyline(stage.waypoints, {
          color: '#64748b',
          weight: 4,
          opacity: 0.45,
          dashArray: '8 8',
          lineJoin: 'round'
        }).addTo(stageLayerGroup);

        ghostLine.on('click', () => selectStage(stage.id));
      }
    });

    const visiblePois = getStagePois();
    visiblePois.forEach((poi) => {
      const globalIdx = STATE.allPois.indexOf(poi);
      const catInfo = getCategoryInfo(poi.category);
      const icon = L.divIcon({
        className: 'poi-div-icon',
        html: `<div class="poi-marker-pin pin-${escapeHtml(poi.category)}" title="${escapeHtml(poi.name)}">${catInfo.svg}</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18]
      });

      const marker = L.marker([poi.lat, poi.lng], { icon });
      marker.on('click', () => openPoiModal(globalIdx));
      marker.addTo(poiLayerGroup);
    });

    rebuildDayManeuvers();
    renderRecordedTrackOnMap();
    renderApproachRouteOnMap();

    if (shouldFit) {
      fitEntireRoute();
    }
    renderSectionSelector();
    renderDioceseOptions();
    renderStageSelector();
    renderRouteSummary();
    renderPoiList();
    updateNearestPoiStats();
    renderTrackerUI();
    updateActiveNavigationHud();
    update3dGuideAndHeading();
    updateWazeSyncState(true);
  }

  function rebuildDayManeuvers() {
    const targetStage = getNavigationTargetStage();
    if (!targetStage || !targetStage.waypoints) {
      STATE.navigation.maneuvers = [];
      els.maneuversCount.textContent = '0';
      els.maneuversList.innerHTML = '<li class="maneuver-item">Brak punktów do wyznaczenia manewrów.</li>';
      return;
    }

    const stagePois = STATE.allPois.filter(
      (p) => !Array.isArray(p.stageIds) || p.stageIds.includes(targetStage.id)
    );
    const steps = buildTurnStepsForDay(targetStage.waypoints, stagePois);
    STATE.navigation.maneuvers = steps;
    els.maneuversCount.textContent = `${steps.length} kroków`;
    renderManeuversList(0);
  }

  function renderManeuversList(currentIndex) {
    const steps = STATE.navigation.maneuvers;
    if (!steps.length) return;
    els.maneuversList.innerHTML = steps
      .map((step, idx) => {
        const cls = idx === currentIndex && STATE.navigation.active ? 'maneuver-item is-current' : 'maneuver-item';
        return `<li class="${cls}"><span class="tabular">${escapeHtml(formatDistance(step.alongMeters))}</span> — ${escapeHtml(step.text)}</li>`;
      })
      .join('');
  }

  // --- CONFIGURATION LOADER & PERSISTENCE ---
  function saveSelectionState() {
    try {
      localStorage.setItem(
        SELECTION_STORAGE_KEY,
        JSON.stringify({
          sectionId: STATE.selectedSectionId,
          dioceseId: STATE.selectedDioceseId,
          stageId: STATE.selectedStageId,
          userPickedDioceseManually: STATE.userPickedDioceseManually
        })
      );
    } catch (_err) {
      // Ignore storage errors
    }
  }

  function loadSavedSelectionState() {
    try {
      const raw = localStorage.getItem(SELECTION_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (_err) {
      return null;
    }
  }

  async function loadDefaultConfig() {
    try {
      const response = await fetch('./route-config.json', { cache: 'no-cache' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const config = await response.json();
      STATE.rootConfig = config;
      STATE.wwDioceses = config.sections?.['ww-trinity']?.dioceses || [];

      const savedSel = loadSavedSelectionState();
      if (savedSel?.dioceseId && STATE.wwDioceses.some((d) => d.id === savedSel.dioceseId)) {
        STATE.selectedDioceseId = savedSel.dioceseId;
        STATE.userPickedDioceseManually = Boolean(savedSel.userPickedDioceseManually);
      }

      const initialSection =
        savedSel?.sectionId && config.sections?.[savedSel.sectionId]
          ? savedSel.sectionId
          : config.defaultSectionId || 'ww-trinity';

      selectSection(initialSection, savedSel?.stageId || null);
      updateNearestDioceseRecommendation(true);
    } catch (_err) {
      els.routeTitle.textContent = 'Nie udało się pobrać route-config.json';
      els.routeMeta.textContent = 'Sprawdź połączenie lub załaduj plik GPX z menu.';
    }
  }

  function selectSection(sectionId, preferredStageId = null) {
    const section = STATE.rootConfig?.sections?.[sectionId];
    if (!section) return;

    STATE.isCustomGpx = false;
    STATE.customGpxName = '';
    STATE.selectedSectionId = sectionId;

    clearApproachRoute();
    if (STATE.navigation.active) {
      stopDayNavigation();
    }

    if (sectionId === 'ww-trinity') {
      const d = getSelectedDioceseObj();
      STATE.stages = d ? d.stages : [];
      STATE.allPois = d ? d.pois : [];
      els.brandTitle.textContent = d ? `WW Trinity · ${d.city}` : 'WW Trinity';
      document.title = d ? `${d.name} — Nawigacja 3D` : 'WW Trinity — Nawigacja 3D';
    } else {
      STATE.stages = Array.isArray(section.stages) ? section.stages : [];
      STATE.allPois = Array.isArray(section.pois) ? section.pois : [];
      els.brandTitle.textContent = section.shortName ? `${section.shortName} · GPS` : section.name;
      document.title = `${section.name} — Nawigacja 3D`;
    }

    if (preferredStageId && (preferredStageId === 'all' || STATE.stages.some((s) => s.id === preferredStageId))) {
      STATE.selectedStageId = preferredStageId;
    } else {
      STATE.selectedStageId = STATE.stages[0]?.id || 'all';
    }

    if (section.accentColor) {
      document.documentElement.style.setProperty('--accent', section.accentColor);
    }

    els.resetRouteBtn.classList.add('hidden');
    saveSelectionState();
    renderRouteAndPois(true);
  }

  function selectWwTrinityDiocese(dioceseId, isManual = true) {
    const d = STATE.wwDioceses.find((item) => item.id === dioceseId);
    if (!d) return;
    if (isManual) STATE.userPickedDioceseManually = true;
    STATE.selectedDioceseId = d.id;
    STATE.selectedSectionId = 'ww-trinity';
    STATE.stages = d.stages;
    STATE.allPois = d.pois;
    STATE.selectedStageId = d.stages[0]?.id || 'all';

    clearApproachRoute();
    if (STATE.navigation.active) stopDayNavigation();

    els.brandTitle.textContent = `WW Trinity · ${d.city}`;
    document.title = `${d.name} — Nawigacja 3D`;
    document.documentElement.style.setProperty('--accent', '#065F46');

    saveSelectionState();
    renderRouteAndPois(true);
    updateNearestDioceseRecommendation(false);
  }

  function selectStage(stageId) {
    STATE.selectedStageId = stageId || 'all';
    clearApproachRoute();
    saveSelectionState();
    renderRouteAndPois(true);
  }

  function fitEntireRoute() {
    if (!map) return;
    setAutoFollow(false);
    const pts = getActiveWaypointsCombined();
    if (pts.length >= 2) {
      map.fitBounds(L.latLngBounds(pts), { padding: [44, 44], maxZoom: 15 });
    } else {
      const stagePois = getStagePois();
      if (stagePois.length > 0) {
        map.fitBounds(L.latLngBounds(stagePois.map((p) => [p.lat, p.lng])), {
          padding: [44, 44],
          maxZoom: 15
        });
      }
    }
  }

  function renderRouteSummary() {
    const activeStages = getActiveStages();
    const stagePois = getStagePois();
    const section = getActiveSectionObj();
    const diocese = getSelectedDioceseObj();

    let totalMeters = 0;
    activeStages.forEach((s) => {
      totalMeters += computePolylineMeters(s.waypoints);
    });
    const distText = totalMeters > 0 ? formatDistance(totalMeters) : 'Brak śladu';
    const walkTimeText = totalMeters > 0 ? formatWalkingDuration(totalMeters) : '';

    if (STATE.isCustomGpx) {
      els.routeTitle.textContent = STATE.customGpxName || 'Własny plik GPX';
      els.routeDesc.textContent = 'Zaimportowany ślad GPS z pliku zewnętrznego.';
      els.routeMeta.innerHTML = `
        <span>Własny GPX</span>
        <span aria-hidden="true">·</span>
        <span class="tabular">${escapeHtml(distText)}</span>
        <span aria-hidden="true">·</span>
        <span>${stagePois.length} pkt POI</span>
      `;
      els.startDayNavBtn.textContent = 'Nawiguj 3D (GPS)';
      return;
    }

    if (STATE.selectedStageId === 'all' || activeStages.length > 1) {
      const title = STATE.selectedSectionId === 'ww-trinity' && diocese ? diocese.name : section?.name || 'Pielgrzymka';
      const desc = STATE.selectedSectionId === 'ww-trinity' && diocese
        ? `Trójjedyna pętla diecezjalna (${diocese.city}, ${diocese.country}): Katedra → Sanktuarium Maryjne → Miłosierdzie Boże → Katedra.`
        : section?.description || '';
      els.routeTitle.textContent = title;
      els.routeDesc.textContent = desc;
      els.routeMeta.innerHTML = `
        <span>${STATE.stages.length} dni / etapy</span>
        <span aria-hidden="true">·</span>
        <span class="tabular">${escapeHtml(distText)}</span>
        <span aria-hidden="true">·</span>
        <span>${escapeHtml(walkTimeText)}</span>
        <span aria-hidden="true">·</span>
        <span>${stagePois.length} pkt POI</span>
      `;
      els.startDayNavBtn.textContent = 'Nawiguj 3D Dzień 1';
    } else if (activeStages[0]) {
      const stage = activeStages[0];
      els.routeTitle.textContent = stage.name;
      els.routeDesc.textContent = stage.description || '';
      els.routeMeta.innerHTML = `
        <span>${escapeHtml(stage.dayLabel || stage.shortLabel)}</span>
        <span aria-hidden="true">·</span>
        <span class="tabular">${escapeHtml(distText)}</span>
        <span aria-hidden="true">·</span>
        <span>${escapeHtml(walkTimeText)}</span>
        <span aria-hidden="true">·</span>
        <span>${stagePois.length} pkt POI</span>
      `;
      els.startDayNavBtn.textContent = `Nawiguj 3D · ${stage.shortLabel || 'Dzień'}`;
    }
  }

  // --- NAVIEXPERT / WAZE-STYLE ACTIVE NAVIGATION ENGINE ---
  function speakInstruction(text) {
    if (!STATE.navigation.voiceEnabled || !('speechSynthesis' in window)) return;
    if (STATE.navigation.lastSpokenKey === text) return;
    STATE.navigation.lastSpokenKey = text;

    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = 'pl-PL';
      utter.rate = 1.02;
      window.speechSynthesis.speak(utter);
    } catch (_err) {
      // Ignore speech synthesis errors
    }
  }

  async function calculateApproachRouteFromGps() {
    const targetStage = getNavigationTargetStage();
    if (!targetStage || !targetStage.waypoints?.length) return;

    if (!STATE.userPosition) {
      els.approachStatus.textContent = 'Oczekiwanie na sygnał GPS, aby wyznaczyć dojście do trasy.';
      els.approachStatus.classList.remove('hidden');
      return;
    }

    const startLatLng = targetStage.waypoints[0];
    const proj = projectPointOntoRoute(STATE.userPosition, targetStage.waypoints);
    const destLatLng = proj.offRouteMeters < haversineMeters(
      STATE.userPosition.lat,
      STATE.userPosition.lng,
      startLatLng[0],
      startLatLng[1]
    ) && proj.nearestLatLng
      ? proj.nearestLatLng
      : startLatLng;

    const directMeters = haversineMeters(
      STATE.userPosition.lat,
      STATE.userPosition.lng,
      destLatLng[0],
      destLatLng[1]
    );

    if (directMeters < 45) {
      clearApproachRoute();
      els.approachStatus.textContent = 'Znajdujesz się już bezpośrednio na wybranej ścieżce.';
      els.approachStatus.classList.remove('hidden');
      return;
    }

    els.approachStatus.textContent = 'Wyznaczanie pieszego dojścia z Twojej pozycji GPS...';
    els.approachStatus.classList.remove('hidden');

    if (navigator.onLine && directMeters < 250000) {
      try {
        const url = `https://router.project-osrm.org/route/v1/foot/${STATE.userPosition.lng},${STATE.userPosition.lat};${destLatLng[1]},${destLatLng[0]}?overview=full&geometries=geojson`;
        const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
        if (res.ok) {
          const data = await res.json();
          const route = data.routes?.[0];
          if (route?.geometry?.coordinates?.length >= 2) {
            STATE.navigation.approachWaypoints = route.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
            STATE.navigation.approachDistanceMeters = route.distance || directMeters;
            renderApproachRouteOnMap();
            map.fitBounds(L.latLngBounds(STATE.navigation.approachWaypoints), { padding: [54, 54], maxZoom: 16 });
            els.approachStatus.textContent = `Wyznaczono piesze dojście do ścieżki: ${formatDistance(STATE.navigation.approachDistanceMeters)} (${formatWalkingDuration(STATE.navigation.approachDistanceMeters)}).`;
            return;
          }
        }
      } catch (_err) {
        // Fallback offline
      }
    }

    STATE.navigation.approachWaypoints = [
      [STATE.userPosition.lat, STATE.userPosition.lng],
      destLatLng
    ];
    STATE.navigation.approachDistanceMeters = directMeters;
    renderApproachRouteOnMap();
    map.fitBounds(L.latLngBounds(STATE.navigation.approachWaypoints), { padding: [54, 54], maxZoom: 16 });
    els.approachStatus.textContent = `Kierunek dojścia do ścieżki: ${formatDistance(directMeters)}.`;
  }

  function clearApproachRoute() {
    STATE.navigation.approachWaypoints = [];
    STATE.navigation.approachDistanceMeters = 0;
    if (approachLayerGroup) approachLayerGroup.clearLayers();
    els.approachStatus.classList.add('hidden');
  }

  function renderApproachRouteOnMap() {
    if (!approachLayerGroup) return;
    approachLayerGroup.clearLayers();
    const pts = STATE.navigation.approachWaypoints;
    if (pts.length < 2) return;

    L.polyline(pts, {
      color: '#ffffff',
      weight: 8,
      opacity: 0.9
    }).addTo(approachLayerGroup);

    L.polyline(pts, {
      color: '#0284c7',
      weight: 4.5,
      dashArray: '8 8',
      opacity: 0.98
    }).addTo(approachLayerGroup);
  }

  function startDayNavigation() {
    const targetStage = getNavigationTargetStage();
    if (!targetStage) return;

    if (STATE.selectedStageId === 'all') {
      STATE.selectedStageId = targetStage.id;
      saveSelectionState();
      renderRouteAndPois(false);
    }

    STATE.navigation.active = true;
    STATE.navigation.lastSpokenKey = '';
    setAutoFollow(true);

    // Engage 3D First-Person Navigation Perspective automatically!
    set3dView(true);

    if (STATE.tracker.status === 'idle') {
      toggleTracker();
    }

    if (window.innerWidth < 1024) {
      setSheetExpanded(false);
    }

    if (STATE.userPosition) {
      const proj = projectPointOntoRoute(STATE.userPosition, targetStage.waypoints);
      if (proj.offRouteMeters > 80) {
        calculateApproachRouteFromGps();
      }
    } else if (targetStage.waypoints?.length && map) {
      map.setView(targetStage.waypoints[0], 15, { animate: true });
    }

    updateActiveNavigationHud();
    update3dGuideAndHeading();

    const firstText = STATE.navigation.maneuvers[0]?.text || `Rozpoczęto nawigację: ${targetStage.name}`;
    speakInstruction(firstText);
  }

  function stopDayNavigation() {
    STATE.navigation.active = false;
    STATE.navigation.isOffRoute = false;
    clearApproachRoute();
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    updateActiveNavigationHud();
  }

  function updateActiveNavigationHud() {
    const isActive = STATE.navigation.active;
    els.navHud.classList.toggle('hidden', !isActive);
    els.layerSwitch.classList.toggle('is-below-hud', isActive);

    if (!isActive) return;

    const targetStage = getNavigationTargetStage();
    if (!targetStage || !targetStage.waypoints?.length) return;

    const totalDayMeters = computePolylineMeters(targetStage.waypoints);
    const steps = STATE.navigation.maneuvers;

    if (!STATE.userPosition) {
      els.navHud.classList.remove('is-offroute');
      els.navOffrouteTag.classList.add('hidden');
      els.navArrowBox.innerHTML = MANEUVER_ARROWS.straight;
      els.navManeuverDist.textContent = formatDistance(totalDayMeters);
      els.navManeuverText.textContent = steps[0]?.text || targetStage.name;
      els.navHudEta.textContent = `Dystans etapu: ${formatDistance(totalDayMeters)} · Oczekiwanie na sygnał GPS`;
      return;
    }

    const proj = projectPointOntoRoute(STATE.userPosition, targetStage.waypoints);
    const remainingMeters = Math.max(0, proj.totalMeters - proj.alongMeters);
    const speedKmh = STATE.tracker.speedKmh > 1.2 ? STATE.tracker.speedKmh : WALKING_SPEED_KMH;
    const etaMinutes = Math.max(1, Math.round((remainingMeters / 1000 / speedKmh) * 60));
    const etaClock = formatEtaClock(etaMinutes);

    if (proj.offRouteMeters > 75 && proj.nearestLatLng) {
      STATE.navigation.isOffRoute = true;
      STATE.navigation.offRouteDistanceMeters = proj.offRouteMeters;

      const returnBearing = computeBearingDeg(
        STATE.userPosition.lat,
        STATE.userPosition.lng,
        proj.nearestLatLng[0],
        proj.nearestLatLng[1]
      );

      els.navHud.classList.add('is-offroute');
      els.navOffrouteTag.classList.remove('hidden');
      els.navArrowBox.innerHTML = MANEUVER_ARROWS.uturn;
      els.navManeuverDist.textContent = formatDistance(proj.offRouteMeters);
      els.navManeuverText.textContent = `Wróć na ścieżkę (kierunek: ${compassDirectionPl(returnBearing)})`;
      els.navHudEta.textContent = `Do celu: ${formatDistance(remainingMeters)} · ETA ${etaClock}`;

      if (STATE.navigation.approachWaypoints.length === 0) {
        STATE.navigation.approachWaypoints = [
          [STATE.userPosition.lat, STATE.userPosition.lng],
          proj.nearestLatLng
        ];
        renderApproachRouteOnMap();
      }
      return;
    }

    STATE.navigation.isOffRoute = false;
    els.navHud.classList.remove('is-offroute');
    els.navOffrouteTag.classList.add('hidden');

    let nextIdx = steps.findIndex((s) => s.alongMeters > proj.alongMeters + 20);
    if (nextIdx === -1) nextIdx = Math.max(0, steps.length - 1);

    const nextStep = steps[nextIdx];
    const distToNext = Math.max(0, nextStep.alongMeters - proj.alongMeters);

    els.navArrowBox.innerHTML = MANEUVER_ARROWS[nextStep.type] || MANEUVER_ARROWS.straight;
    els.navManeuverDist.textContent = formatDistance(distToNext);
    els.navManeuverText.textContent = nextStep.text;
    els.navHudEta.textContent = `Do celu: ${formatDistance(remainingMeters)} · ${etaMinutes} min · Cel o ${etaClock}`;
    renderManeuversList(nextIdx);

    if (distToNext <= 65) {
      speakInstruction(`Za ${Math.max(10, Math.round(distToNext / 10) * 10)} metrów: ${nextStep.text}`);
    }
  }

  // --- PILGRIM GPS TRACKER ---
  function loadSavedTrackerState() {
    try {
      const raw = localStorage.getItem(TRACKER_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved && Array.isArray(saved.recordedPoints)) {
        STATE.tracker.elapsedSec = Number(saved.elapsedSec) || 0;
        STATE.tracker.traveledMeters = Number(saved.traveledMeters) || 0;
        STATE.tracker.recordedPoints = saved.recordedPoints;
        STATE.tracker.lastPoint = saved.recordedPoints[saved.recordedPoints.length - 1] || null;
        if (saved.status === 'recording' || saved.status === 'paused') {
          STATE.tracker.status = 'paused';
        }
      }
    } catch (_err) {
      // Ignore
    }
  }

  function persistTrackerState() {
    try {
      localStorage.setItem(
        TRACKER_STORAGE_KEY,
        JSON.stringify({
          status: STATE.tracker.status,
          elapsedSec: STATE.tracker.elapsedSec,
          traveledMeters: STATE.tracker.traveledMeters,
          recordedPoints: STATE.tracker.recordedPoints.slice(-3000)
        })
      );
    } catch (_err) {
      // Ignore
    }
  }

  function startTrackerTimer() {
    stopTrackerTimer();
    STATE.tracker.timerHandle = setInterval(() => {
      if (STATE.tracker.status === 'recording') {
        STATE.tracker.elapsedSec += 1;
        els.statElapsed.textContent = formatDuration(STATE.tracker.elapsedSec);
        if (STATE.tracker.elapsedSec % 10 === 0) {
          persistTrackerState();
        }
      }
    }, 1000);
  }

  function stopTrackerTimer() {
    if (STATE.tracker.timerHandle) {
      clearInterval(STATE.tracker.timerHandle);
      STATE.tracker.timerHandle = null;
    }
  }

  function toggleTracker() {
    if (STATE.tracker.status === 'idle' || STATE.tracker.status === 'paused') {
      STATE.tracker.status = 'recording';
      if (STATE.userPosition && STATE.userPosition.accuracy <= 100) {
        recordTrackerPoint(
          STATE.userPosition.lat,
          STATE.userPosition.lng,
          STATE.userPosition.accuracy,
          STATE.userPosition.speed
        );
      }
      startTrackerTimer();
    } else {
      STATE.tracker.status = 'paused';
      stopTrackerTimer();
    }
    persistTrackerState();
    renderTrackerUI();
  }

  function resetTracker() {
    stopTrackerTimer();
    STATE.tracker.status = 'idle';
    STATE.tracker.elapsedSec = 0;
    STATE.tracker.traveledMeters = 0;
    STATE.tracker.speedKmh = 0;
    STATE.tracker.recordedPoints = [];
    STATE.tracker.lastPoint = null;
    localStorage.removeItem(TRACKER_STORAGE_KEY);
    renderRecordedTrackOnMap();
    renderTrackerUI();
    renderTelemetry();
  }

  function recordTrackerPoint(lat, lng, accuracy, speedMs) {
    if (STATE.tracker.status !== 'recording') return;
    if (accuracy > 80) return;

    const nowIso = new Date().toISOString();
    const prev = STATE.tracker.lastPoint;

    if (prev) {
      const stepMeters = haversineMeters(prev.lat, prev.lng, lat, lng);
      if (stepMeters < 5) return;
      if (stepMeters < 800) {
        STATE.tracker.traveledMeters += stepMeters;
      }
      const dtSec = Math.max(1, (Date.now() - new Date(prev.time).getTime()) / 1000);
      const calcSpeed = (stepMeters / dtSec) * 3.6;
      STATE.tracker.speedKmh =
        speedMs != null && !Number.isNaN(speedMs) && speedMs >= 0
          ? speedMs * 3.6
          : Math.min(20, calcSpeed);
    } else if (speedMs != null && !Number.isNaN(speedMs) && speedMs >= 0) {
      STATE.tracker.speedKmh = speedMs * 3.6;
    }

    const pt = { lat, lng, time: nowIso, accuracy: Math.round(accuracy) };
    STATE.tracker.recordedPoints.push(pt);
    STATE.tracker.lastPoint = pt;

    renderRecordedTrackOnMap();
    persistTrackerState();
    renderTrackerUI();
  }

  function renderRecordedTrackOnMap() {
    if (!map) return;
    if (recordedHaloLine) {
      map.removeLayer(recordedHaloLine);
      recordedHaloLine = null;
    }
    if (recordedLine) {
      map.removeLayer(recordedLine);
      recordedLine = null;
    }

    const pts = STATE.tracker.recordedPoints.map((p) => [p.lat, p.lng]);
    if (pts.length >= 2) {
      recordedHaloLine = L.polyline(pts, {
        color: '#ffffff',
        weight: 8,
        opacity: 0.9,
        lineJoin: 'round'
      }).addTo(map);

      recordedLine = L.polyline(pts, {
        color: '#d97706',
        weight: 4.5,
        opacity: 0.98,
        dashArray: '10 6',
        lineJoin: 'round'
      }).addTo(map);
    }
  }

  function renderTrackerUI() {
    const t = STATE.tracker;
    els.statElapsed.textContent = formatDuration(t.elapsedSec);
    els.statTraveled.textContent = formatDistance(t.traveledMeters);
    els.trackerPointsCount.textContent = `${t.recordedPoints.length} pkt`;
    els.trackerSpeed.textContent = `${t.speedKmh.toFixed(1)} km/h`;

    const activePts = getActiveWaypointsCombined();
    const proj = projectPointOntoRoute(STATE.userPosition, activePts);
    els.trackerProgress.textContent = `Postęp ${proj.progressPct}%`;

    if (t.status === 'recording') {
      els.trackerStateText.textContent = 'Nagrywanie śladu';
      els.trackerToggleBtn.textContent = 'Pauza';
      els.trackerToggleBtn.classList.add('is-recording');
    } else if (t.status === 'paused') {
      els.trackerStateText.textContent = 'Wstrzymano';
      els.trackerToggleBtn.textContent = 'Wznów';
      els.trackerToggleBtn.classList.remove('is-recording');
    } else {
      els.trackerStateText.textContent = 'Gotowy do zapisu';
      els.trackerToggleBtn.textContent = 'Start trackera';
      els.trackerToggleBtn.classList.remove('is-recording');
    }

    const hasTrack = t.recordedPoints.length >= 2 || t.elapsedSec > 0 || t.traveledMeters > 0;
    els.trackerExportBtn.disabled = t.recordedPoints.length < 2;
    els.trackerResetBtn.disabled = !hasTrack;
  }

  function exportRecordedGpx() {
    const pts = STATE.tracker.recordedPoints;
    if (pts.length < 2) return;

    const nowIso = new Date().toISOString();
    const section = getActiveSectionObj();
    const trackName = `Nagrany ślad — ${section?.name || 'Szlak Pielgrzyma'}`;
    const trkptsXml = pts
      .map(
        (p) =>
          `      <trkpt lat="${p.lat}" lon="${p.lng}">\n        <time>${escapeXml(p.time)}</time>\n      </trkpt>`
      )
      .join('\n');

    const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Szlak Pielgrzyma 3D PWA" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(trackName)}</name>
    <time>${nowIso}</time>
  </metadata>
  <trk>
    <name>${escapeXml(trackName)}</name>
    <trkseg>
${trkptsXml}
    </trkseg>
  </trk>
</gpx>`;

    downloadTextFile(gpx, `slad-pielgrzyma-${nowIso.slice(0, 10)}.gpx`, 'application/gpx+xml;charset=utf-8');
  }

  // --- GEOLOCATION TRACKING ---
  function startGeolocation() {
    if (!('geolocation' in navigator)) {
      STATE.gpsError = 'Twoja przeglądarka nie obsługuje modułu GPS.';
      renderTelemetry();
      updateNearestDioceseRecommendation(false);
      return;
    }

    let firstLock = true;
    STATE.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy, speed, heading } = pos.coords;
        STATE.gpsError = null;
        STATE.userPosition = {
          lat: latitude,
          lng: longitude,
          accuracy: accuracy || 0,
          speed,
          heading
        };

        recordTrackerPoint(latitude, longitude, accuracy || 0, speed);
        updateUserMapMarker(latitude, longitude, accuracy);

        if (STATE.autoFollow && map) {
          map.panTo([latitude, longitude], { animate: true, duration: 0.4 });
        }

        updateNearestDioceseRecommendation(firstLock);
        firstLock = false;
        updateNearestPoiStats();
        renderTelemetry();
        renderTrackerUI();
        updateActiveNavigationHud();
        update3dGuideAndHeading();
        updateWazeSyncState(false);
      },
      (err) => {
        if (err.code === 1) {
          STATE.gpsError = 'Brak zgody na lokalizację GPS. Włącz uprawnienia w przeglądarce.';
        } else if (err.code === 2) {
          STATE.gpsError = 'Sygnał GPS jest chwilowo niedostępny.';
        } else {
          STATE.gpsError = 'Przekroczono czas oczekiwania na pozycję GPS.';
        }
        renderTelemetry();
        updateNearestDioceseRecommendation(false);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 4000,
        timeout: 15000
      }
    );
  }

  function requestImmediateGpsCheck() {
    if (!('geolocation' in navigator)) return;
    els.nearestDioceseName.textContent = 'Pobieranie pozycji GPS...';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        STATE.gpsError = null;
        STATE.userPosition = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy || 0,
          speed: pos.coords.speed,
          heading: pos.coords.heading
        };
        updateUserMapMarker(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
        updateNearestDioceseRecommendation(true);
        renderTelemetry();
        update3dGuideAndHeading();
        updateWazeSyncState(false);
      },
      () => {
        STATE.gpsError = 'Nie udało się pobrać pozycji GPS. Sprawdź uprawnienia lokalizacji.';
        updateNearestDioceseRecommendation(false);
        renderTelemetry();
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function updateUserMapMarker(lat, lng, accuracy) {
    if (!map) return;

    if (!userMarker) {
      const pilgrimIcon = L.divIcon({
        className: 'pilgrim-div-icon',
        html: '<div class="pilgrim-marker-wrap" aria-label="Twoja pozycja"><div class="pilgrim-marker-core"></div></div>',
        iconSize: [26, 26],
        iconAnchor: [13, 13]
      });
      userMarker = L.marker([lat, lng], { icon: pilgrimIcon, zIndexOffset: 1000 }).addTo(map);
      accuracyCircle = L.circle([lat, lng], {
        radius: accuracy || 15,
        color: '#065F46',
        weight: 1.5,
        fillColor: '#10b981',
        fillOpacity: 0.14
      }).addTo(map);
    } else {
      userMarker.setLatLng([lat, lng]);
      accuracyCircle.setLatLng([lat, lng]);
      accuracyCircle.setRadius(accuracy || 15);
    }
  }

  function setAutoFollow(enabled) {
    STATE.autoFollow = enabled;
    els.centerMeBtn.classList.toggle('is-active', enabled);
    els.centerMeBtn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    if (enabled && STATE.userPosition && map) {
      map.setView([STATE.userPosition.lat, STATE.userPosition.lng], Math.max(map.getZoom(), 15), {
        animate: true
      });
    }
  }

  function getNearestPoi() {
    const stagePois = getStagePois();
    if (!STATE.userPosition || stagePois.length === 0) return null;
    let nearest = null;
    let minMeters = Infinity;
    for (const poi of stagePois) {
      const dist = haversineMeters(STATE.userPosition.lat, STATE.userPosition.lng, poi.lat, poi.lng);
      if (dist < minMeters) {
        minMeters = dist;
        nearest = { poi, meters: dist };
      }
    }
    return nearest;
  }

  function updateNearestPoiStats() {
    const stagePois = getStagePois();
    const nearest = getNearestPoi();
    const section = getActiveSectionObj();
    if (nearest) {
      els.statNearestDist.textContent = formatDistance(nearest.meters);
      els.nearestPoiLine.textContent = `Najbliższy punkt: ${nearest.poi.name}`;
    } else if (stagePois.length > 0) {
      els.statNearestDist.textContent = '—';
      els.nearestPoiLine.textContent = `${section?.shortName || 'Szlak'} · ${stagePois.length} pkt na trasie`;
    } else {
      els.statNearestDist.textContent = '—';
      els.nearestPoiLine.textContent = 'Brak punktów POI na ścieżce';
    }
  }

  function renderTelemetry() {
    if (STATE.gpsError) {
      els.gpsWarningBox.textContent = STATE.gpsError;
      els.gpsWarningBox.classList.remove('hidden');
      els.statAccuracy.textContent = 'Brak';
      els.statAccuracy.classList.remove('is-gps-ok');
      els.statAccuracy.classList.add('is-gps-warn');
    } else if (STATE.userPosition) {
      els.gpsWarningBox.classList.add('hidden');
      const acc = Math.round(STATE.userPosition.accuracy);
      els.statAccuracy.textContent = `±${acc} m`;
      els.statAccuracy.classList.toggle('is-gps-ok', acc <= 30);
      els.statAccuracy.classList.toggle('is-gps-warn', acc > 30);
    } else {
      els.gpsWarningBox.classList.add('hidden');
      els.statAccuracy.textContent = 'Szukam...';
    }

    els.statTraveled.textContent = formatDistance(STATE.tracker.traveledMeters);
    renderPoiList();
  }

  // --- POI LIST & FILTERS ---
  function renderPoiList() {
    const stagePois = getStagePois();
    const filtered = stagePois
      .map((poi) => ({ poi, idx: STATE.allPois.indexOf(poi) }))
      .filter(({ poi }) => STATE.activeFilter === 'all' || poi.category === STATE.activeFilter);

    if (filtered.length === 0) {
      els.poiList.innerHTML = '<li class="empty-state">Brak punktów POI dla wybranego etapu i kategorii.</li>';
      return;
    }

    els.poiList.innerHTML = filtered
      .map(({ poi, idx }) => {
        const catInfo = getCategoryInfo(poi.category);
        const distMeters = STATE.userPosition
          ? haversineMeters(STATE.userPosition.lat, STATE.userPosition.lng, poi.lat, poi.lng)
          : null;
        const distStr = distMeters != null ? formatDistance(distMeters) : `${poi.lat.toFixed(3)}, ${poi.lng.toFixed(3)}`;
        const timePart = poi.time ? `<span aria-hidden="true">·</span><span class="tabular">${escapeHtml(poi.time)}</span>` : '';

        return `
          <li class="poi-row">
            <button type="button" class="poi-row-btn" data-poi-index="${idx}">
              <span class="poi-cat-glyph cat-${escapeHtml(poi.category)}" aria-hidden="true">${catInfo.svg}</span>
              <span class="poi-row-info">
                <span class="poi-row-meta">
                  <span>${escapeHtml(poi.categoryLabel || catInfo.label)}</span>
                  ${timePart}
                </span>
                <span class="poi-row-title">${escapeHtml(poi.name)}</span>
              </span>
              <span class="poi-row-dist tabular">${escapeHtml(distStr)}</span>
            </button>
          </li>
        `;
      })
      .join('');
  }

  // --- BOTTOM SHEET INTERACTION ---
  function setSheetExpanded(expanded) {
    STATE.sheetExpanded = expanded;
    els.poiSheet.classList.toggle('is-expanded', expanded);
    els.sheetExpandBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    els.sheetExpandLabel.textContent = expanded ? 'Pokaż mapę' : 'Wybierz trasę';
  }

  function setupBottomSheetGestures() {
    let startY = null;
    els.sheetHandleZone.addEventListener('touchstart', (e) => {
      if (window.innerWidth >= 1024) return;
      startY = e.touches[0].clientY;
    }, { passive: true });

    els.sheetHandleZone.addEventListener('touchend', (e) => {
      if (window.innerWidth >= 1024 || startY === null) return;
      const deltaY = e.changedTouches[0].clientY - startY;
      startY = null;
      if (deltaY < -36) setSheetExpanded(true);
      else if (deltaY > 36) setSheetExpanded(false);
    }, { passive: true });

    els.sheetExpandBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setSheetExpanded(!STATE.sheetExpanded);
    });

    els.sheetHandleZone.addEventListener('click', () => {
      if (window.innerWidth < 1024) {
        setSheetExpanded(!STATE.sheetExpanded);
      }
    });
  }

  // --- POI MODAL ---
  function openPoiModal(index) {
    const poi = STATE.allPois[index];
    if (!poi) return;
    STATE.selectedPoiIndex = index;

    const catInfo = getCategoryInfo(poi.category);
    const distMeters = STATE.userPosition
      ? haversineMeters(STATE.userPosition.lat, STATE.userPosition.lng, poi.lat, poi.lng)
      : null;

    const parts = [escapeHtml(poi.categoryLabel || catInfo.label)];
    if (poi.time) parts.push(`<span class="tabular">Godz. ${escapeHtml(poi.time)}</span>`);
    if (distMeters != null) parts.push(`<span class="tabular">${escapeHtml(formatDistance(distMeters))} od Ciebie</span>`);

    els.poiModalKicker.innerHTML = parts.join(' <span aria-hidden="true">·</span> ');
    els.poiModalTitle.textContent = poi.name;
    els.poiModalDesc.textContent = poi.description || 'Punkt trasy pielgrzymkowej.';

    if (poi.prayerText) {
      els.poiModalPrayerBox.classList.remove('hidden');
      els.poiModalPrayerTitle.textContent = poi.prayerTitle || 'Rozważanie i modlitwa';
      els.poiModalPrayerText.textContent = poi.prayerText;
    } else {
      els.poiModalPrayerBox.classList.add('hidden');
    }

    if (els.poiModalWazeLink) {
      els.poiModalWazeLink.href = buildWazeUniversalUrl(poi.lat, poi.lng, STATE.userPosition);
    }
    if (els.poiModalCoMapsLink) {
      const poiComapsUrls = buildCoMapsUrls(poi.lat, poi.lng, poi.name);
      applyCoMapsLink(els.poiModalCoMapsLink, poiComapsUrls);
    }

    els.poiModal.classList.remove('hidden');
    els.poiModalClose.focus();
  }

  function closePoiModal() {
    els.poiModal.classList.add('hidden');
  }

  // --- GPX EXPORT & IMPORT ---
  function downloadTextFile(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function exportPlannedGpx() {
    const activeStages = getActiveStages();
    const stagePois = getStagePois();
    const section = getActiveSectionObj();
    const diocese = getSelectedDioceseObj();
    const routeName =
      STATE.selectedSectionId === 'ww-trinity' && diocese
        ? `${diocese.name}`
        : section?.name || 'Szlak Pielgrzyma';
    const baseFileName =
      STATE.selectedSectionId === 'ww-trinity' && diocese
        ? `${diocese.id}.gpx`
        : section?.gpxFileName || 'szlak-pielgrzyma.gpx';
    const fileName =
      STATE.selectedStageId === 'all'
        ? baseFileName
        : `${STATE.selectedStageId}-${baseFileName}`;
    const isoNow = new Date().toISOString();

    const wptsXml = stagePois
      .map(
        (poi) => `  <wpt lat="${poi.lat}" lon="${poi.lng}">
    <name>${escapeXml(poi.name)}</name>
    <desc>${escapeXml(poi.description || '')}</desc>
    <type>${escapeXml(poi.categoryLabel || poi.category)}</type>
  </wpt>`
      )
      .join('\n');

    const tracksXml = activeStages
      .map((stage) => {
        const trkptsXml = (stage.waypoints || [])
          .map(([lat, lng]) => `      <trkpt lat="${lat}" lon="${lng}"></trkpt>`)
          .join('\n');
        return `  <trk>
    <name>${escapeXml(stage.name)}</name>
    <trkseg>
${trkptsXml}
    </trkseg>
  </trk>`;
      })
      .join('\n');

    const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Szlak Pielgrzyma 3D PWA" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${escapeXml(routeName)}</name>
    <time>${isoNow}</time>
  </metadata>
${wptsXml}
${tracksXml}
</gpx>`;

    downloadTextFile(gpx, fileName, 'application/gpx+xml;charset=utf-8');
  }

  function handleGpxImport(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const xml = new DOMParser().parseFromString(String(reader.result || ''), 'application/xml');
        if (xml.querySelector('parsererror')) {
          throw new Error('Nieprawidłowy format pliku XML/GPX.');
        }

        const trkNodes = Array.from(xml.querySelectorAll('trk'));
        const importedStages = [];

        if (trkNodes.length > 0) {
          trkNodes.forEach((trk, idx) => {
            const pts = Array.from(trk.querySelectorAll('trkpt'))
              .map((el) => [parseFloat(el.getAttribute('lat')), parseFloat(el.getAttribute('lon'))])
              .filter(([lat, lng]) => !Number.isNaN(lat) && !Number.isNaN(lng));
            if (pts.length >= 2) {
              const name = trk.querySelector('name')?.textContent?.trim() || `Dzień ${idx + 1}`;
              importedStages.push({
                id: `gpx-trk-${idx + 1}`,
                shortLabel: trkNodes.length > 1 ? `Dzień ${idx + 1}` : 'GPX',
                name,
                dayLabel: 'Zaimportowany ślad GPX',
                description: '',
                color: ['#065F46', '#1D4ED8', '#9A3412'][idx % 3],
                waypoints: pts
              });
            }
          });
        } else {
          const rtePts = Array.from(xml.querySelectorAll('rtept'))
            .map((el) => [parseFloat(el.getAttribute('lat')), parseFloat(el.getAttribute('lon'))])
            .filter(([lat, lng]) => !Number.isNaN(lat) && !Number.isNaN(lng));
          if (rtePts.length >= 2) {
            importedStages.push({
              id: 'gpx-rte-1',
              shortLabel: 'GPX',
              name: file.name,
              dayLabel: 'Zaimportowana trasa GPX',
              description: '',
              color: '#065F46',
              waypoints: rtePts
            });
          }
        }

        const wpts = Array.from(xml.querySelectorAll('wpt'))
          .map((el, i) => {
            const lat = parseFloat(el.getAttribute('lat'));
            const lng = parseFloat(el.getAttribute('lon'));
            const name = el.querySelector('name')?.textContent?.trim() || `Punkt GPX ${i + 1}`;
            const desc = el.querySelector('desc')?.textContent?.trim() || 'Punkt zaimportowany z pliku GPX.';
            return {
              id: `gpx-wpt-${i}`,
              name,
              category: i === 0 ? 'start_meta' : 'church',
              categoryLabel: 'Punkt GPX',
              time: '',
              lat,
              lng,
              description: desc,
              prayerTitle: '',
              prayerText: ''
            };
          })
          .filter((p) => !Number.isNaN(p.lat) && !Number.isNaN(p.lng));

        if (importedStages.length === 0 && wpts.length === 0) {
          throw new Error('Plik GPX nie zawiera punktów trasy ani waypointów.');
        }

        STATE.isCustomGpx = true;
        STATE.customGpxName = xml.querySelector('metadata > name, trk > name')?.textContent?.trim() || file.name;
        STATE.stages = importedStages;
        STATE.allPois = wpts;
        STATE.selectedStageId = importedStages[0]?.id || 'all';
        STATE.activeFilter = 'all';
        updateFilterButtons();
        els.resetRouteBtn.classList.remove('hidden');
        renderRouteAndPois(true);
        els.menuModal.classList.add('hidden');
      } catch (err) {
        els.tileCacheStatus.textContent = err.message || 'Błąd odczytu pliku GPX.';
      }
    };
    reader.readAsText(file);
  }

  // --- OFFLINE TILE PRE-CACHER ---
  function latLngToTile(lat, lng, zoom) {
    const n = Math.pow(2, zoom);
    const x = Math.floor(((lng + 180) / 360) * n);
    const latRad = (lat * Math.PI) / 180;
    const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
    return { x, y };
  }

  function buildTileUrlsForRoute() {
    const allStagePts = [];
    STATE.stages.forEach((s) => (s.waypoints || []).forEach((pt) => allStagePts.push(pt)));
    const pts = allStagePts.length ? allStagePts : STATE.allPois.map((p) => [p.lat, p.lng]);
    if (!pts.length) return [];

    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    pts.forEach(([lat, lng]) => {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    });

    minLat -= 0.006;
    maxLat += 0.006;
    minLng -= 0.008;
    maxLng += 0.008;

    const template =
      STATE.activeLayer === 'topo'
        ? 'https://a.tile.opentopomap.org/{z}/{x}/{y}.png'
        : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

    const urls = [];
    for (const z of [12, 13, 14]) {
      const tl = latLngToTile(maxLat, minLng, z);
      const br = latLngToTile(minLat, maxLng, z);
      for (let x = tl.x; x <= br.x; x++) {
        for (let y = tl.y; y <= br.y; y++) {
          urls.push(template.replace('{z}', z).replace('{x}', x).replace('{y}', y));
          if (urls.length >= 160) return urls;
        }
      }
    }
    return urls;
  }

  async function precacheRouteTiles() {
    if (STATE.isCachingTiles) return;
    if (!navigator.onLine) {
      els.tileCacheStatus.textContent = 'Brak połączenia z internetem. Połącz się, aby pobrać kafelki.';
      return;
    }

    const urls = buildTileUrlsForRoute();
    if (!urls.length) return;

    STATE.isCachingTiles = true;
    els.cacheTilesBtn.disabled = true;
    els.tileProgressWrap.classList.remove('hidden');
    els.tileProgressFill.style.width = '0%';
    els.tileCacheStatus.textContent = `Pobieranie ${urls.length} kafelków mapy do pamięci offline...`;

    let done = 0;
    const batchSize = 6;
    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      await Promise.allSettled(
        batch.map((url) => fetch(url, { mode: 'cors' }).catch(() => null))
      );
      done += batch.length;
      const pct = Math.min(100, Math.round((done / urls.length) * 100));
      els.tileProgressFill.style.width = `${pct}%`;
    }

    STATE.isCachingTiles = false;
    els.cacheTilesBtn.disabled = false;
    await refreshTileCacheCount();
  }

  async function refreshTileCacheCount() {
    if (!('caches' in window)) {
      els.tileCacheStatus.textContent = 'Cache API niedostępne w tej przeglądarce.';
      return;
    }
    try {
      const cache = await caches.open('pilgrim-tiles-v1');
      const keys = await cache.keys();
      els.tileCacheStatus.textContent = `Zapisane kafelki mapy offline: ${keys.length} szt.`;
    } catch (_err) {
      els.tileCacheStatus.textContent = 'Zapisywanie odwiedzonych kafelków aktywne.';
    }
  }

  async function clearTileCache() {
    if ('caches' in window) {
      await caches.delete('pilgrim-tiles-v1');
      els.tileProgressWrap.classList.add('hidden');
      els.tileCacheStatus.textContent = 'Wyczyszczono pamięć kafelków mapy (0 szt.).';
    }
  }

  // --- PWA INSTALL & ONLINE/OFFLINE ---
  function setupPwaInstallAndConnectivity() {
    const standaloneQuery = window.matchMedia('(display-mode: standalone)');
    const checkStandalone = () =>
      standaloneQuery.matches || window.navigator.standalone === true;

    STATE.isInstalled = checkStandalone();
    STATE.isIOS =
      /iphone|ipad|ipod/i.test(window.navigator.userAgent) ||
      (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);

    try {
      STATE.installCardDismissed = sessionStorage.getItem('pwa_install_card_dismissed') === '1';
    } catch (_err) {
      STATE.installCardDismissed = false;
    }

    const updateInstallButtons = () => {
      if (STATE.isInstalled) {
        els.installBtn.classList.add('hidden');
        els.pwaInstallCard.classList.add('hidden');
        els.menuInstallWrap.classList.add('hidden');
        return;
      }

      els.installBtn.classList.remove('hidden');
      els.menuInstallWrap.classList.remove('hidden');
      els.pwaInstallCard.classList.toggle('hidden', STATE.installCardDismissed);

      if (STATE.deferredInstallPrompt) {
        els.cardInstallLabel.textContent = 'Zainstaluj teraz jednym kliknięciem';
        els.pwaInstallSubtitle.textContent =
          'Aplikacja zainstaluje się automatycznie na ekranie głównym i będzie gotowa do pracy offline w lesie.';
      } else if (STATE.isIOS) {
        els.cardInstallLabel.textContent = 'Dodaj do ekranu iPhone / iPad';
        els.pwaInstallSubtitle.textContent =
          'Zainstaluj na ekranie początkowym Safari, aby korzystać z nawigacji na pełnym ekranie i bez internetu.';
      } else {
        els.cardInstallLabel.textContent = 'Zainstaluj aplikację PWA';
        els.pwaInstallSubtitle.textContent =
          'Kliknij, aby zainstalować wersję PWA na urządzeniu i uruchamiać nawigację bezpośrednio z ekranu głównego.';
      }
    };

    const showFallbackInstallGuide = () => {
      if (STATE.isIOS) {
        els.iosModalKicker.textContent = 'iPhone / iPad (Safari)';
        els.iosModalTitle.textContent = 'Dodaj do ekranu początkowego';
        els.iosModalBody.innerHTML = `
          <p class="modal-desc">1. Dotknij ikonę <strong>Udostępnij</strong> (kwadrat ze strzałką w górę) na pasku przeglądarki Safari.</p>
          <p class="modal-desc">2. Przewiń listę w dół i wybierz <strong>Do ekranu początkowego</strong>, a następnie zatwierdź przyciskiem <strong>Dodaj</strong>.</p>
        `;
      } else {
        const isInIframe = window.self !== window.top;
        els.iosModalKicker.textContent = 'Instalacja na urządzeniu (PWA)';
        els.iosModalTitle.textContent = 'Jak dokończyć instalację';
        els.iosModalBody.innerHTML = isInIframe
          ? `
            <p class="modal-desc">1. Otwórz aplikację w osobnej karcie przeglądarki (poza podglądem osadzonym w ramce), aby system odblokował automatyczny instalator PWA.</p>
            <p class="modal-desc">2. Następnie kliknij <strong>Zainstaluj PWA</strong> lub ikonę instalacji na pasku adresu.</p>
          `
          : `
            <p class="modal-desc">1. W przeglądarce Chrome / Edge / Brave kliknij ikonę instalacji po prawej stronie paska adresu lub otwórz menu przeglądarki (<strong>⋮</strong>).</p>
            <p class="modal-desc">2. Wybierz opcję <strong>Zainstaluj aplikację</strong> lub <strong>Dodaj do ekranu głównego</strong> — instalacja uruchomi się automatycznie.</p>
          `;
      }
      els.iosModal.classList.remove('hidden');
      els.iosModalClose.focus();
    };

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      STATE.deferredInstallPrompt = e;
      updateInstallButtons();
    });

    window.addEventListener('appinstalled', () => {
      STATE.isInstalled = true;
      STATE.deferredInstallPrompt = null;
      updateInstallButtons();
    });

    if (typeof standaloneQuery.addEventListener === 'function') {
      standaloneQuery.addEventListener('change', (e) => {
        STATE.isInstalled = e.matches || window.navigator.standalone === true;
        updateInstallButtons();
      });
    }

    const triggerInstall = async () => {
      if (STATE.deferredInstallPrompt) {
        try {
          await STATE.deferredInstallPrompt.prompt();
          const choice = await STATE.deferredInstallPrompt.userChoice;
          if (choice.outcome === 'accepted') {
            STATE.isInstalled = true;
            STATE.deferredInstallPrompt = null;
            updateInstallButtons();
            return;
          }
          STATE.deferredInstallPrompt = null;
          updateInstallButtons();
        } catch (_err) {
          showFallbackInstallGuide();
        }
        return;
      }
      showFallbackInstallGuide();
    };

    els.installBtn.addEventListener('click', triggerInstall);
    els.cardInstallBtn.addEventListener('click', triggerInstall);
    els.menuInstallBtn.addEventListener('click', triggerInstall);
    els.dismissInstallCardBtn.addEventListener('click', () => {
      STATE.installCardDismissed = true;
      try {
        sessionStorage.setItem('pwa_install_card_dismissed', '1');
      } catch (_err) {
        // Ignore
      }
      updateInstallButtons();
    });

    const closeInstallModal = () => els.iosModal.classList.add('hidden');
    els.iosModalClose.addEventListener('click', closeInstallModal);
    els.iosModalOk.addEventListener('click', closeInstallModal);
    els.iosModal.addEventListener('click', (e) => {
      if (e.target === els.iosModal) closeInstallModal();
    });

    updateInstallButtons();

    const updateOnlineBanner = () => {
      els.offlineBanner.classList.toggle('hidden', navigator.onLine);
    };
    window.addEventListener('online', updateOnlineBanner);
    window.addEventListener('offline', updateOnlineBanner);
    updateOnlineBanner();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(() => null);
    }
  }

  // --- EVENT WIRING ---
  function updateFilterButtons() {
    els.filterBar.querySelectorAll('.filter-btn').forEach((btn) => {
      const isMatch = btn.getAttribute('data-filter') === STATE.activeFilter;
      btn.classList.toggle('is-active', isMatch);
      btn.setAttribute('aria-pressed', isMatch ? 'true' : 'false');
    });
  }

  function updateRegionButtons() {
    els.dioceseRegionBar.querySelectorAll('.filter-btn').forEach((btn) => {
      const isMatch = btn.getAttribute('data-region') === STATE.dioceseRegionFilter;
      btn.classList.toggle('is-active', isMatch);
      btn.setAttribute('aria-pressed', isMatch ? 'true' : 'false');
    });
  }

  function wireEvents() {
    els.layerOsmBtn.addEventListener('click', () => switchBaseLayer('osm'));
    els.layerTopoBtn.addEventListener('click', () => switchBaseLayer('topo'));
    els.toggle3dBtn.addEventListener('click', () => set3dView(!STATE.is3dView));
    els.centerMeBtn.addEventListener('click', () => setAutoFollow(!STATE.autoFollow));
    els.fitRouteBtn.addEventListener('click', fitEntireRoute);
    els.navFitBtn.addEventListener('click', fitEntireRoute);
    els.navExportBtn.addEventListener('click', exportPlannedGpx);
    els.navOfflineBtn.addEventListener('click', openMenuModal);

    els.sectionSelector.addEventListener('click', (e) => {
      const btn = e.target.closest('.pilgrimage-btn');
      if (!btn) return;
      const sectionId = btn.getAttribute('data-section-id');
      if (sectionId) selectSection(sectionId);
    });

    els.pickNearestDioceseBtn.addEventListener('click', () => {
      if (STATE.nearestDiocese?.diocese) {
        selectWwTrinityDiocese(STATE.nearestDiocese.diocese.id, true);
      }
    });

    els.detectGpsDioceseBtn.addEventListener('click', requestImmediateGpsCheck);

    els.dioceseSearch.addEventListener('input', (e) => {
      STATE.dioceseSearchQuery = e.target.value || '';
      renderDioceseOptions();
    });

    els.dioceseRegionBar.addEventListener('click', (e) => {
      const btn = e.target.closest('.filter-btn');
      if (!btn) return;
      STATE.dioceseRegionFilter = btn.getAttribute('data-region') || 'all';
      updateRegionButtons();
      renderDioceseOptions();
    });

    els.dioceseSelect.addEventListener('change', (e) => {
      if (e.target.value) {
        selectWwTrinityDiocese(e.target.value, true);
      }
    });

    els.stageSelector.addEventListener('click', (e) => {
      const btn = e.target.closest('.stage-btn');
      if (!btn) return;
      const stageId = btn.getAttribute('data-stage-id');
      if (stageId) selectStage(stageId);
    });

    els.startDayNavBtn.addEventListener('click', startDayNavigation);
    els.routeApproachBtn.addEventListener('click', calculateApproachRouteFromGps);
    els.stopNavBtn.addEventListener('click', stopDayNavigation);

    els.wazeAutoSyncBtn.addEventListener('click', toggleWazeAutoSync);
    els.wazeModeBar.addEventListener('click', (e) => {
      const btn = e.target.closest('.filter-btn');
      if (!btn) return;
      const mode = btn.getAttribute('data-waze-mode');
      if (mode) setWazeMode(mode);
    });
    els.wazePrevBtn.addEventListener('click', () => stepWazeWaypoint(-1));
    els.wazeNextBtn.addEventListener('click', () => stepWazeWaypoint(1));
    els.wazeCopyBtn.addEventListener('click', copyWazeLinkToClipboard);
    if (els.comapsCopyBtn) els.comapsCopyBtn.addEventListener('click', copyCoMapsLinkToClipboard);

    els.voiceToggleBtn.addEventListener('click', () => {
      STATE.navigation.voiceEnabled = !STATE.navigation.voiceEnabled;
      els.voiceToggleBtn.setAttribute('aria-pressed', STATE.navigation.voiceEnabled ? 'true' : 'false');
      els.iconVoiceOn.classList.toggle('hidden', !STATE.navigation.voiceEnabled);
      els.iconVoiceOff.classList.toggle('hidden', STATE.navigation.voiceEnabled);
      if (!STATE.navigation.voiceEnabled && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    });

    els.trackerToggleBtn.addEventListener('click', toggleTracker);
    els.trackerExportBtn.addEventListener('click', exportRecordedGpx);
    els.trackerResetBtn.addEventListener('click', resetTracker);

    els.filterBar.addEventListener('click', (e) => {
      const btn = e.target.closest('.filter-btn');
      if (!btn) return;
      STATE.activeFilter = btn.getAttribute('data-filter') || 'all';
      updateFilterButtons();
      renderPoiList();
    });

    els.poiList.addEventListener('click', (e) => {
      const btn = e.target.closest('.poi-row-btn');
      if (!btn) return;
      const idx = Number(btn.getAttribute('data-poi-index'));
      if (!Number.isNaN(idx)) openPoiModal(idx);
    });

    els.poiModalClose.addEventListener('click', closePoiModal);
    els.poiModal.addEventListener('click', (e) => {
      if (e.target === els.poiModal) closePoiModal();
    });

    els.poiModalLocate.addEventListener('click', () => {
      const poi = STATE.allPois[STATE.selectedPoiIndex];
      if (!poi || !map) return;
      setAutoFollow(false);
      map.setView([poi.lat, poi.lng], 16, { animate: true });
      closePoiModal();
      setSheetExpanded(false);
    });

    els.poiModalNext.addEventListener('click', () => {
      const stagePois = getStagePois();
      if (!stagePois.length) return;
      const currentPoi = STATE.allPois[STATE.selectedPoiIndex];
      const posInStage = stagePois.indexOf(currentPoi);
      const nextPoi = stagePois[(posInStage + 1) % stagePois.length];
      openPoiModal(STATE.allPois.indexOf(nextPoi));
    });

    function openMenuModal() {
      refreshTileCacheCount();
      els.menuModal.classList.remove('hidden');
      els.menuModalClose.focus();
    }

    els.menuBtn.addEventListener('click', openMenuModal);
    els.menuModalClose.addEventListener('click', () => els.menuModal.classList.add('hidden'));
    els.menuModal.addEventListener('click', (e) => {
      if (e.target === els.menuModal) els.menuModal.classList.add('hidden');
    });

    els.exportGpxBtn.addEventListener('click', exportPlannedGpx);
    els.importGpxInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (file) handleGpxImport(file);
      e.target.value = '';
    });

    els.resetRouteBtn.addEventListener('click', () => {
      selectSection(STATE.selectedSectionId);
      els.menuModal.classList.add('hidden');
    });

    els.cacheTilesBtn.addEventListener('click', precacheRouteTiles);
    els.clearTilesBtn.addEventListener('click', clearTileCache);

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closePoiModal();
        els.menuModal.classList.add('hidden');
        els.iosModal.classList.add('hidden');
      }
    });
  }

  // --- WAZE NAVIGATION SYNCHRONIZATION ---
  function loadSavedWazeSyncState() {
    try {
      const raw = localStorage.getItem(WAZE_SYNC_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (typeof parsed.autoSync === 'boolean') {
        STATE.waze.autoSync = parsed.autoSync;
      }
      if (parsed.mode === 'next_poi' || parsed.mode === 'day_end' || parsed.mode === 'approach') {
        STATE.waze.mode = parsed.mode;
      }
    } catch (_err) {
      // Ignore storage errors
    }
  }

  function saveWazeSyncState() {
    try {
      localStorage.setItem(
        WAZE_SYNC_STORAGE_KEY,
        JSON.stringify({
          autoSync: STATE.waze.autoSync,
          mode: STATE.waze.mode
        })
      );
    } catch (_err) {
      // Ignore storage errors
    }
  }

  function buildWazeUniversalUrl(destLat, destLng, userPos) {
    const params = new URLSearchParams({
      ll: `${Number(destLat).toFixed(6)},${Number(destLng).toFixed(6)}`,
      navigate: 'yes',
      zoom: '17'
    });
    if (userPos && Number.isFinite(userPos.lat) && Number.isFinite(userPos.lng)) {
      params.set('from', `${userPos.lat.toFixed(6)},${userPos.lng.toFixed(6)}`);
    }
    return `https://www.waze.com/ul?${params.toString()}`;
  }

  function sanitizePointLabel(name) {
    if (!name) return 'Cel';
    return String(name)
      .replace(/[\/\\?#%]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function buildCoMapsUrls(destLat, destLng, destName) {
    const lat = Number(destLat).toFixed(6);
    const lng = Number(destLng).toFixed(6);
    const cleanLabel = sanitizePointLabel(destName);
    const encoded = encodeURIComponent(cleanLabel);

    // Standard RFC 5870 Geo URI: handled by CoMaps and Organic Maps on Android as a location intent.
    // Prevents CoMaps HTTP intent filter from mistakenly treating the URL as a file download ("typ pliku nie jest rozpoznawany").
    const geoUrl = `geo:${lat},${lng}?q=${lat},${lng}(${encoded})`;

    // Native app scheme for CoMaps on iOS / Android
    const appUrl = `cm://${lat},${lng}/${encoded}`;

    // Canonical OpenStreetMap web preview via CoMaps
    const webUrl = `https://comaps.at/${lat},${lng}/${encoded}`;

    return {
      lat,
      lng,
      label: cleanLabel,
      geoUrl,
      appUrl,
      webUrl
    };
  }

  function applyCoMapsLink(anchorEl, urls) {
    if (!anchorEl || !urls) return;
    const ua = typeof navigator !== 'undefined' ? (navigator.userAgent || '') : '';
    const isAndroid = /Android/i.test(ua);
    const isIOS = /iPhone|iPad|iPod/i.test(ua);

    if (isAndroid) {
      anchorEl.href = urls.geoUrl;
      anchorEl.removeAttribute('target');
      anchorEl.title = `Prowadź w CoMaps (nawigacja GPS do: ${urls.label})`;
    } else if (isIOS) {
      anchorEl.href = urls.appUrl;
      anchorEl.removeAttribute('target');
      anchorEl.title = `Prowadź w CoMaps (nawigacja GPS do: ${urls.label})`;
    } else {
      anchorEl.href = urls.webUrl;
      anchorEl.target = '_blank';
      anchorEl.rel = 'noopener noreferrer';
      anchorEl.title = `Pokaż punkt „${urls.label}” w CoMaps (OpenStreetMap)`;
    }
  }

  function getWazeSyncStopsForDay() {
    const targetStage = getNavigationTargetStage();
    const stagePois = getStagePois();
    const stops = [];

    if (stagePois.length > 0) {
      stagePois.forEach((poi) => {
        stops.push({
          name: poi.name,
          lat: poi.lat,
          lng: poi.lng,
          kind: poi.categoryLabel || getCategoryInfo(poi.category).label
        });
      });
    }

    const wps = targetStage?.waypoints || [];
    if (wps.length >= 2) {
      const endPt = wps[wps.length - 1];
      const hasEndNear = stops.some((s) => haversineMeters(s.lat, s.lng, endPt[0], endPt[1]) < 90);
      if (!hasEndNear) {
        stops.push({
          name: `Meta: ${targetStage.name}`,
          lat: endPt[0],
          lng: endPt[1],
          kind: 'Cel dnia'
        });
      }
    }

    return stops;
  }

  function resolveWazeTarget(resetIndexIfChanged = false) {
    const targetStage = getNavigationTargetStage();
    const wps = targetStage?.waypoints || [];
    const stops = getWazeSyncStopsForDay();

    if (resetIndexIfChanged) {
      STATE.waze.waypointIndex = 0;
    }

    if (STATE.waze.mode === 'approach' && wps.length >= 2) {
      if (STATE.userPosition) {
        const proj = projectPointOntoRoute(STATE.userPosition, wps);
        const pt = proj.nearestLatLng || wps[0];
        return {
          name: proj.offRouteMeters > 75 ? 'Powrót na ścieżkę' : `Start / wejście na: ${targetStage.shortLabel || targetStage.name}`,
          lat: pt[0],
          lng: pt[1],
          kind: 'Wejście na szlak',
          stepLabel: ''
        };
      }
      return {
        name: `Start: ${targetStage.name}`,
        lat: wps[0][0],
        lng: wps[0][1],
        kind: 'Start ścieżki',
        stepLabel: ''
      };
    }

    if (STATE.waze.mode === 'day_end' && wps.length >= 2) {
      const endPt = wps[wps.length - 1];
      const lastStop = stops[stops.length - 1];
      return {
        name: lastStop && haversineMeters(lastStop.lat, lastStop.lng, endPt[0], endPt[1]) < 120
          ? `Meta dnia: ${lastStop.name}`
          : `Meta: ${targetStage.name}`,
        lat: endPt[0],
        lng: endPt[1],
        kind: 'Meta dnia',
        stepLabel: ''
      };
    }

    // Mode: 'next_poi' (auto-advances when pilgrim reaches < 85m of current stop)
    if (stops.length > 0) {
      let idx = Math.max(0, Math.min(stops.length - 1, STATE.waze.waypointIndex));

      if (STATE.waze.autoSync && STATE.userPosition) {
        // Automatically advance if pilgrim arrived within 85m of current stop and more stops remain
        while (idx < stops.length - 1) {
          const d = haversineMeters(
            STATE.userPosition.lat,
            STATE.userPosition.lng,
            stops[idx].lat,
            stops[idx].lng
          );
          if (d <= 85) {
            idx += 1;
          } else {
            break;
          }
        }
        STATE.waze.waypointIndex = idx;
      }

      const stop = stops[idx];
      return {
        name: stop.name,
        lat: stop.lat,
        lng: stop.lng,
        kind: stop.kind,
        stepLabel: `Punkt ${idx + 1}/${stops.length}`,
        totalStops: stops.length
      };
    }

    if (wps.length > 0) {
      const fallback = wps[wps.length - 1];
      return {
        name: targetStage?.name || 'Wybrana trasa',
        lat: fallback[0],
        lng: fallback[1],
        kind: 'Cel trasy',
        stepLabel: ''
      };
    }

    return null;
  }

  function updateWazeSyncState(resetIndexIfChanged = false) {
    if (!els.wazeSyncPanel) return;

    els.wazeAutoSyncBtn.classList.toggle('is-active', STATE.waze.autoSync);
    els.wazeAutoSyncBtn.setAttribute('aria-pressed', STATE.waze.autoSync ? 'true' : 'false');
    els.wazeAutoSyncBtn.textContent = STATE.waze.autoSync ? 'Auto-sync: WŁ' : 'Auto-sync: WYŁ';

    els.wazeModeBar.querySelectorAll('.filter-btn').forEach((btn) => {
      const match = btn.getAttribute('data-waze-mode') === STATE.waze.mode;
      btn.classList.toggle('is-active', match);
      btn.setAttribute('aria-pressed', match ? 'true' : 'false');
    });

    const target = resolveWazeTarget(resetIndexIfChanged);
    if (!target) {
      els.wazeTargetName.textContent = 'Brak wyznaczonego punktu na trasie';
      els.wazeTargetCoords.textContent = '—';
      els.wazeStepCounter.textContent = '';
      els.wazeStepControls.classList.add('hidden');
      return;
    }

    const wazeUrl = buildWazeUniversalUrl(target.lat, target.lng, STATE.userPosition);
    const comapsUrls = buildCoMapsUrls(target.lat, target.lng, target.name);
    STATE.waze.currentUrl = wazeUrl;
    STATE.waze.comapsUrl = comapsUrls.webUrl;
    STATE.waze.comapsGeoUrl = comapsUrls.geoUrl;
    STATE.waze.comapsAppUrl = comapsUrls.appUrl;
    STATE.waze.lastSyncedTargetName = target.name;

    if (els.wazeOpenLink) els.wazeOpenLink.href = wazeUrl;
    applyCoMapsLink(els.comapsOpenLink, comapsUrls);
    if (els.hudWazeLink) {
      els.hudWazeLink.href = wazeUrl;
      els.hudWazeLink.title = `Prowadź w Waze do: ${target.name}`;
    }
    applyCoMapsLink(els.hudCoMapsLink, comapsUrls);

    els.wazeTargetName.textContent = target.name;
    els.wazeStepCounter.textContent = target.stepLabel || target.kind;

    const showStepper = STATE.waze.mode === 'next_poi' && (target.totalStops || 0) > 1;
    els.wazeStepControls.classList.toggle('hidden', !showStepper);

    const coordsText = `${target.lat.toFixed(5)}, ${target.lng.toFixed(5)}`;
    if (STATE.userPosition) {
      const dist = haversineMeters(STATE.userPosition.lat, STATE.userPosition.lng, target.lat, target.lng);
      const brg = computeBearingDeg(STATE.userPosition.lat, STATE.userPosition.lng, target.lat, target.lng);
      els.wazeTargetCoords.textContent = `${formatDistance(dist)} · ${Math.round(brg)}° ${compassShort(brg)} · ${coordsText}`;
    } else {
      els.wazeTargetCoords.textContent = coordsText;
    }

    els.wazeSyncStatus.textContent = STATE.waze.autoSync
      ? (STATE.userPosition ? 'Zsynchronizowano z GPS (Waze & CoMaps)' : 'Gotowy do synchronizacji z trasą')
      : 'Ręczny wybór punktu docelowego (Waze & CoMaps)';
  }

  function setWazeMode(mode) {
    STATE.waze.mode = mode;
    saveWazeSyncState();
    updateWazeSyncState(false);
  }

  function toggleWazeAutoSync() {
    STATE.waze.autoSync = !STATE.waze.autoSync;
    saveWazeSyncState();
    updateWazeSyncState(false);
  }

  function stepWazeWaypoint(delta) {
    const stops = getWazeSyncStopsForDay();
    if (stops.length <= 1) return;
    STATE.waze.mode = 'next_poi';
    STATE.waze.autoSync = false;
    STATE.waze.waypointIndex = (STATE.waze.waypointIndex + delta + stops.length) % stops.length;
    saveWazeSyncState();
    updateWazeSyncState(false);
  }

  async function copyWazeLinkToClipboard() {
    const url = STATE.waze.currentUrl;
    if (!url) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const tmp = document.createElement('input');
        tmp.value = url;
        document.body.appendChild(tmp);
        tmp.select();
        document.execCommand('copy');
        document.body.removeChild(tmp);
      }
      const prev = els.wazeCopyBtn.textContent;
      els.wazeCopyBtn.textContent = 'Skopiowano link';
      setTimeout(() => {
        els.wazeCopyBtn.textContent = prev;
      }, 1800);
    } catch (_err) {
      els.wazeSyncStatus.textContent = 'Użyj przycisku „Prowadź w Waze”, aby otworzyć bezpośrednio.';
    }
  }

  async function copyCoMapsLinkToClipboard() {
    const url = STATE.waze.comapsUrl;
    if (!url) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const tmp = document.createElement('input');
        tmp.value = url;
        document.body.appendChild(tmp);
        tmp.select();
        document.execCommand('copy');
        document.body.removeChild(tmp);
      }
      if (els.comapsCopyBtn) {
        const prev = els.comapsCopyBtn.textContent;
        els.comapsCopyBtn.textContent = 'Skopiowano link';
        setTimeout(() => {
          els.comapsCopyBtn.textContent = prev;
        }, 1800);
      }
    } catch (_err) {
      els.wazeSyncStatus.textContent = 'Użyj przycisku „Prowadź w CoMaps”, aby otworzyć bezpośrednio.';
    }
  }

  // --- BOOTSTRAP ---
  document.addEventListener('DOMContentLoaded', () => {
    loadSavedTrackerState();
    loadSavedWazeSyncState();
    initMap();
    setupBottomSheetGestures();
    wireEvents();
    setupPwaInstallAndConnectivity();
    loadDefaultConfig();
    startGeolocation();
    renderTrackerUI();
  });
})();
