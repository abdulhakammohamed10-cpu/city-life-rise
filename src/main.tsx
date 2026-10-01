import React from 'react';
import { createRoot } from 'react-dom/client';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Sky } from '@react-three/drei';
import * as THREE from 'three';
import { create } from 'zustand';
import { BriefcaseBusiness, Heart, Zap, MapPin, Footprints, Crosshair, Building2, CarFront, Navigation, Store, Landmark, Package, CircleDollarSign, Sparkles, DoorOpen, Target, RotateCcw, Shield } from 'lucide-react';
import './styles.css';
import { vehicleRuntime, resetVehicleRuntime } from './vehicle-runtime';

type MissionStage = 'visit' | 'offer' | 'deliver' | 'complete';
type Phase = 'intro' | 'cinematic' | 'playing' | 'paused';
type Cinematic = 'none' | 'arrival' | 'enterVehicle' | 'deliveryComplete';
type VehicleView = 'third' | 'first';
type GameState = {
  phase: Phase;
  cinematic: Cinematic;
  cinematicStartedAt: number;
  vehicleView: VehicleView;
  energy: number;
  moving: boolean;
  sprint: boolean;
  cash: number;
  xp: number;
  reputation: number;
  level: number;
  mission: MissionStage;
  playerX: number;
  playerY: number;
  playerZ: number;
  flying: boolean;
  toast: string;
  start: () => void;
  startCinematic: (name: Exclude<Cinematic, 'none'>) => void;
  finishCinematic: () => void;
  skipCinematic: () => void;
  toggleVehicleView: () => void;
  pause: () => void;
  resume: () => void;
  tick: (dt: number) => void;
  setPosition: (x: number, z: number) => void;
  openOffer: () => void;
  acceptJob: () => void;
  completeJob: () => void;
  clearToast: () => void;
  inVehicle: boolean;
  vehicleX: number;
  vehicleZ: number;
  vehicleYaw: number;
  vehicleSpeed: number;
  vehicleSteer: number;
  vehicleRoll: number;
  vehiclePitch: number;
  vehicleWheelAngle: number;
  vehicleReverse: boolean;
  vehicleBrake: boolean;
  fuel: number;
  vehicleCondition: number;
  lightsOn: boolean;
  weaponOwned: boolean;
  weaponAmmo: number;
  weaponReserve: number;
  kills: number;
  hitMarker: boolean;
  shotSeq: number;
  buyWeapon: () => void;
  reloadWeapon: () => void;
  enterVehicle: () => void;
  exitVehicle: () => void;
  toggleLights: () => void;
  toggleFlying: () => void;
  insideBuilding: boolean;
  buildingFloor: number;
  enterBuilding: () => void;
  exitBuilding: () => void;
};

const EMPLOYMENT = new THREE.Vector3(43, 0, 24);
const DELIVERY = new THREE.Vector3(-9, 0, -48);
const VEHICLE_START = new THREE.Vector3(34, 0.1, 21);
const WEAPON_SHOP = new THREE.Vector3(84, 0, 24);

// Enterable tower: players can walk through the lobby, use the staircase and reach upper floors.
const ENTERABLE_BUILDING = { x: -43, z: -43, w: 30, d: 30, h: 18 };
const BUILDING_FLOOR_H = 3.5;
const BUILDING_FLOOR_BASE_Y = 1.05;


type CombatTarget = { group: THREE.Group; health: number; alive: boolean; deathStartedAt: number; fallSign: number };

let shotSeqCounter = 0;
let lastShotVisualAt = 0;
let combatCameraKick = 0;

const combatTargets: CombatTarget[] = [];
let activeCamera: THREE.Camera | null = null;
let lastPulseShotAt = 0;
const pulseRaycaster = new THREE.Raycaster();
const pulseNdc = new THREE.Vector2(0, 0);

const useGame = create<GameState>((set, get) => ({
  phase: 'intro',
  cinematic: 'none',
  cinematicStartedAt: 0,
  vehicleView: 'third',
  energy: 100,
  moving: false,
  sprint: false,
  cash: 500,
  xp: 0,
  reputation: 0,
  level: 1,
  mission: 'visit',
  playerX: -9,
  playerY: 1.05,
  playerZ: 20,
  flying: false,
  toast: '',
  inVehicle: false,
  vehicleX: VEHICLE_START.x,
  vehicleZ: VEHICLE_START.z,
  vehicleYaw: 0,
  vehicleSpeed: 0,
  vehicleSteer: 0,
  vehicleRoll: 0,
  vehiclePitch: 0,
  vehicleWheelAngle: 0,
  vehicleReverse: false,
  vehicleBrake: false,
  fuel: 100,
  vehicleCondition: 100,
  lightsOn: false,
  insideBuilding: false,
  buildingFloor: 0,
  weaponOwned: false,
  weaponAmmo: 12,
  weaponReserve: 60,
  kills: 0,
  hitMarker: false,
  shotSeq: 0,
  buyWeapon: () => set({ weaponOwned: true, weaponAmmo: 12, weaponReserve: 60, toast: 'FREE PULSE PISTOL acquired. Left click or F to fire.' }),
  reloadWeapon: () => set((s) => {
    if (!s.weaponOwned || s.weaponAmmo >= 12 || s.weaponReserve <= 0) return s;
    const needed = 12 - s.weaponAmmo;
    const loaded = Math.min(needed, s.weaponReserve);
    return { weaponAmmo: s.weaponAmmo + loaded, weaponReserve: s.weaponReserve - loaded, toast: 'Pulse pistol reloaded.' };
  }),
  enterVehicle: () => set((s) => { resetVehicleRuntime(s.vehicleX, s.vehicleZ, s.vehicleYaw); return { inVehicle: true, flying: false, playerX: s.vehicleX, playerY: 1.05, playerZ: s.vehicleZ, phase: 'playing', cinematic: 'none', cinematicStartedAt: 0, vehicleSpeed: 0, vehicleSteer: 0, vehicleRoll: 0, vehiclePitch: 0, vehicleWheelAngle: 0, vehicleReverse: false, vehicleBrake: false, toast: 'Vehicle entered. W/S throttle • A/D steer • V camera • L lights' }; }),
  exitVehicle: () => set((s) => {
    const sideX = Math.cos(s.vehicleYaw);
    const sideZ = -Math.sin(s.vehicleYaw);
    return { inVehicle: false, playerX: s.vehicleX - sideX * 1.8, playerZ: s.vehicleZ - sideZ * 1.8, vehicleSpeed: 0, vehicleSteer: 0, vehicleRoll: 0, vehiclePitch: 0, vehicleWheelAngle: 0, vehicleReverse: false, vehicleBrake: false, toast: 'Vehicle exited.' };
  }),
  toggleLights: () => set((s) => ({ lightsOn: !s.lightsOn, toast: s.lightsOn ? 'Headlights off.' : 'Headlights on.' })),
  toggleFlying: () => set((s) => {
    if (s.inVehicle || s.insideBuilding || s.phase !== 'playing') return s;
    const next = !s.flying;
    return { flying: next, playerY: next ? Math.max(s.playerY, 4.2) : 1.05, energy: next ? s.energy : Math.max(s.energy, 30), toast: next ? 'WINGS DEPLOYED • G fly • SPACE up • CTRL down • SHIFT boost' : 'Wings folded. Back on the street.' };
  }),
  enterBuilding: () => set({ insideBuilding: true, buildingFloor: 0, playerX: ENTERABLE_BUILDING.x, playerZ: ENTERABLE_BUILDING.z - ENTERABLE_BUILDING.d / 2 + 2.4, toast: 'Apartment tower entered. Follow the staircase upstairs.' }),
  exitBuilding: () => set({ insideBuilding: false, flying: false, buildingFloor: 0, playerY: 1.05, playerX: ENTERABLE_BUILDING.x, playerZ: ENTERABLE_BUILDING.z - ENTERABLE_BUILDING.d / 2 - 1.8, toast: 'Back outside.' }),
  start: () => set({ phase: 'playing', cinematic: 'none' }),
  startCinematic: (name) => set({ phase: 'cinematic', cinematic: name, cinematicStartedAt: performance.now() }),
  finishCinematic: () => set((s) => ({ phase: 'playing', cinematic: 'none', cinematicStartedAt: 0, toast: s.cinematic === 'arrival' ? 'Welcome to Downtown. Your story starts now.' : s.cinematic === 'enterVehicle' ? 'Drive to Harbor Hub. W/S throttle, A/D steer, SPACE handbrake.' : s.toast })),
  skipCinematic: () => set({ phase: 'playing', cinematic: 'none', cinematicStartedAt: 0 }),
  toggleVehicleView: () => set((s) => ({ vehicleView: s.vehicleView === 'third' ? 'first' : 'third' })),
  pause: () => set({ phase: 'paused', moving: false, sprint: false }),
  resume: () => set({ phase: 'playing', cinematic: 'none' }),
  tick: (dt) => set((s) => ({ energy: s.sprint && s.moving ? Math.max(0, s.energy - dt * 5) : Math.min(100, s.energy + dt * 2) })),
  setPosition: (x, z) => set({ playerX: x, playerZ: z }),
  openOffer: () => set({ mission: 'offer', toast: 'Employment center check-in complete.' }),
  acceptJob: () => { resetVehicleRuntime(VEHICLE_START.x, VEHICLE_START.z, 0); set({ mission: 'deliver', vehicleX: VEHICLE_START.x, vehicleZ: VEHICLE_START.z, vehicleYaw: 0, vehicleSpeed: 0, vehicleSteer: 0, inVehicle: false, toast: 'Delivery accepted. Walk to the van.' }); },
  completeJob: () => {
    const s = get();
    const nextXp = s.xp + 50;
    const nextLevel = nextXp >= 100 ? 2 : 1;
    set({ mission: 'complete', cash: s.cash + 100, xp: nextXp % 100, level: nextLevel, reputation: s.reputation + 5, inVehicle: false, insideBuilding: false, buildingFloor: 0, vehicleSpeed: 0, phase: 'cinematic', cinematic: 'deliveryComplete', cinematicStartedAt: performance.now(), toast: 'Delivery complete. +$100  +50 XP' });
  },
  clearToast: () => set({ toast: '' }),
}));

const keys = new Set<string>();
const look = { yaw: Math.PI, pitch: -0.05 };

function firePulse() {
  const s = useGame.getState();
  const now = performance.now();
  if (now - lastPulseShotAt < 145 || s.phase !== 'playing' || s.inVehicle || !s.weaponOwned) return;
  lastPulseShotAt = now;
  combatCameraKick = 1;

  if (s.weaponAmmo <= 0) {
    useGame.setState({ toast: 'Pulse pistol empty. Press R to reload.' });
    return;
  }

  const ammoAfterShot = Math.max(0, s.weaponAmmo - 1);
  shotSeqCounter += 1;
  lastShotVisualAt = now;
  useGame.setState({ weaponAmmo: ammoAfterShot, shotSeq: shotSeqCounter, hitMarker: false });

  if (!activeCamera) return;
  pulseRaycaster.setFromCamera(pulseNdc, activeCamera);
  let best: { target: CombatTarget; distance: number; point: THREE.Vector3 } | null = null;
  for (const target of combatTargets) {
    if (!target.alive || !target.group.visible) continue;
    const hits = pulseRaycaster.intersectObject(target.group, true);
    if (!hits.length) continue;
    const hit = hits[0];
    if (!hit) continue;
    if (!best || hit.distance < best.distance) best = { target, distance: hit.distance, point: hit.point.clone() };
  }

  if (best && best.distance < 55) {
    best.target.health = 0;
    best.target.alive = false;
    best.target.deathStartedAt = now;
    best.target.fallSign = (best.target.group.uuid.charCodeAt(0) % 2 === 0) ? 1 : -1;
    useGame.setState({
      weaponAmmo: ammoAfterShot,
      kills: s.kills + 1,
      hitMarker: true,
      toast: `TARGET DOWN • ${s.kills + 1} elimination${s.kills === 0 ? '' : 's'}`,
    });
    window.setTimeout(() => useGame.setState({ hitMarker: false }), 180);
  } else {
    useGame.setState({ weaponAmmo: ammoAfterShot, toast: 'Pulse missed.' });
  }
}

function Input({ root }: { root: React.RefObject<HTMLDivElement | null> }) {
  React.useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      keys.add(e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      const s = useGame.getState();
      if ((e.code === 'Enter' || e.code === 'Space') && !e.repeat && s.phase === 'cinematic') {
        e.preventDefault();
        keys.delete(e.code);
        s.skipCinematic();
        return;
      }
      if (e.code === 'KeyV' && !e.repeat && s.phase === 'playing' && s.inVehicle) {
        s.toggleVehicleView();
        return;
      }
      if (e.code === 'KeyG' && !e.repeat && s.phase === 'playing' && !s.inVehicle && !s.insideBuilding) {
        s.toggleFlying();
        return;
      }
      if (e.code === 'KeyL' && !e.repeat && s.phase === 'playing' && s.inVehicle) {
        s.toggleLights();
        return;
      }
      if (e.code === 'KeyR' && !e.repeat && s.phase === 'playing' && !s.inVehicle && s.weaponOwned) {
        e.preventDefault();
        s.reloadWeapon();
        return;
      }
      if (e.code === 'KeyF' && !e.repeat && s.phase === 'playing' && !s.inVehicle && s.weaponOwned) {
        e.preventDefault();
        firePulse();
        return;
      }
      if (e.code === 'Enter' && !e.repeat && s.phase === 'playing' && s.mission === 'offer') {
        e.preventDefault();
        s.acceptJob();
        return;
      }
      if ((e.code === 'Enter' || e.code === 'KeyE') && !e.repeat && s.phase === 'playing' && !s.inVehicle && s.mission === 'deliver') {
        const dVehicle = Math.hypot(s.playerX - s.vehicleX, s.playerZ - s.vehicleZ);
        if (dVehicle < 8.5) {
          e.preventDefault();
          keys.delete(e.code);
          s.enterVehicle();
          return;
        }
      }
      if (e.code === 'KeyE' && !e.repeat && s.phase === 'playing') {
        if (s.inVehicle) {
          const dTarget = Math.hypot(s.vehicleX - DELIVERY.x, s.vehicleZ - DELIVERY.z);
          if (s.mission === 'deliver' && dTarget < 10 && s.vehicleSpeed < 3) s.completeJob();
          else if (s.vehicleSpeed < 1) s.exitVehicle();
          return;
        }
        const dEmployment = Math.hypot(s.playerX - EMPLOYMENT.x, s.playerZ - EMPLOYMENT.z);
        const dVehicle = Math.hypot(s.playerX - s.vehicleX, s.playerZ - s.vehicleZ);
        const dWeaponShop = Math.hypot(s.playerX - WEAPON_SHOP.x, s.playerZ - WEAPON_SHOP.z);
        const buildingDoorZ = ENTERABLE_BUILDING.z - ENTERABLE_BUILDING.d / 2 - 1.7;
        const dBuildingDoor = Math.hypot(s.playerX - ENTERABLE_BUILDING.x, s.playerZ - buildingDoorZ);
        if (s.insideBuilding) {
          if (s.buildingFloor === 0 && dBuildingDoor < 4.2) s.exitBuilding();
          return;
        }
        if (dWeaponShop < 8.5 && !s.weaponOwned) s.buyWeapon();
        else if (dEmployment < 9 && s.mission === 'visit') s.openOffer();
        else if (s.mission === 'deliver' && dVehicle < 8.5) s.enterVehicle();
        else if (dBuildingDoor < 5.4) s.enterBuilding();
      }
    };
    const ku = (e: KeyboardEvent) => keys.delete(e.code);
    const mm = (e: MouseEvent) => {
      if (document.pointerLockElement !== root.current) return;
      look.yaw -= e.movementX * 0.0018;
      look.pitch = THREE.MathUtils.clamp(look.pitch - e.movementY * 0.0018, -1.42, 1.42);
    };
    const md = (e: MouseEvent) => {
      if (e.button !== 0 || document.pointerLockElement !== root.current) return;
      const s = useGame.getState();
      if (s.phase === 'playing' && !s.inVehicle && s.weaponOwned) { e.preventDefault(); firePulse(); }
    };
    const pl = () => {
      const s = useGame.getState();
      if (document.pointerLockElement === root.current && s.phase !== 'cinematic') s.resume();
      else if (!document.pointerLockElement && s.phase === 'playing') s.pause();
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    document.addEventListener('mousemove', mm);
    document.addEventListener('mousedown', md);
    document.addEventListener('pointerlockchange', pl);
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      document.removeEventListener('mousemove', mm);
      document.removeEventListener('mousedown', md);
      document.removeEventListener('pointerlockchange', pl);
    };
  }, [root]);
  return null;
}

const OUTER_BUILDING_LOTS = (() => {
  const centers = [-100, -60, -20, 20, 60, 100];
  const lots: [number, number, number, number][] = [];
  for (const x of centers) {
    for (const z of centers) {
      if (Math.abs(x) <= 60 && Math.abs(z) <= 60) continue;
      if ((x === -100 && z === 20) || (x === 100 && z === -20) || (x === -20 && z === -100) || (x === 20 && z === 100)) continue;
      const w = 16 + ((Math.abs(x + z) / 20) % 3) * 2;
      const d = 15 + ((Math.abs(x - z) / 20) % 3) * 2;
      lots.push([x, z, w, d]);
    }
  }
  return lots;
})();

const boxColliders: [number, number, number, number][] = [
  [-58, -28, -58, -28],
  [-58, -28, 28, 58],
  [28, 58, -58, -28],
  [28, 58, 34, 58],
  [-70, -56, -12, 12],
  [56, 70, -11, 11],
  ...OUTER_BUILDING_LOTS.map(([x, z, w, d]) => [x - w / 2, x + w / 2, z - d / 2, z + d / 2] as [number, number, number, number]),
  [-115, -93, 14, 30],
  [93, 115, -30, -14],
  [-33, -15, -113, -95],
  [15, 33, 95, 113],
];
function blocked(x: number, z: number, insideBuilding = false) {
  const r = .45;
  return boxColliders.some(([minX, maxX, minZ, maxZ]) => {
    // The selected tower is hollow and walkable when the player is inside it.
    const isEnterableTower = minX === -58 && maxX === -28 && minZ === -58 && maxZ === -28;
    if (insideBuilding && isEnterableTower) return false;
    return x + r > minX && x - r < maxX && z + r > minZ && z - r < maxZ;
  });
}

function insideEnterableTower(x: number, z: number) {
  return x > ENTERABLE_BUILDING.x - ENTERABLE_BUILDING.w / 2 + 1.0 &&
    x < ENTERABLE_BUILDING.x + ENTERABLE_BUILDING.w / 2 - 1.0 &&
    z > ENTERABLE_BUILDING.z - ENTERABLE_BUILDING.d / 2 + 1.0 &&
    z < ENTERABLE_BUILDING.z + ENTERABLE_BUILDING.d / 2 - 1.0;
}

function stairHeight(x: number, z: number) {
  // Three switchback-style flights let the player continuously walk between floors.
  const lx = x - ENTERABLE_BUILDING.x;
  const lz = z - ENTERABLE_BUILDING.z;
  const flights = [
    { x0: -10.5, x1: -3.5, z0: -10.5, z1: -3.5, from: 0, axis: 'z' as const },
    { x0: -3.5, x1: 4.5, z0: -3.5, z1: 4.5, from: 1, axis: 'x' as const },
    { x0: 4.5, x1: 12.5, z0: 4.5, z1: 12.5, from: 2, axis: 'z' as const },
  ];
  for (const f of flights) {
    if (lx >= Math.min(f.x0, f.x1) - .55 && lx <= Math.max(f.x0, f.x1) + .55 && lz >= Math.min(f.z0, f.z1) - .55 && lz <= Math.max(f.z0, f.z1) + .55) {
      const t = f.axis === 'x'
        ? THREE.MathUtils.clamp((lx - f.x0) / Math.max(.001, f.x1 - f.x0), 0, 1)
        : THREE.MathUtils.clamp((lz - f.z0) / Math.max(.001, f.z1 - f.z0), 0, 1);
      return BUILDING_FLOOR_BASE_Y + (f.from + t) * BUILDING_FLOOR_H;
    }
  }
  return null;
}
function Player() {
  const { camera } = useThree();
  const pos = React.useRef(new THREE.Vector3(-9, 1.05, 20));
  const vel = React.useRef(new THREE.Vector3());
  const grounded = React.useRef(true);
  const jumpHeld = React.useRef(false);
  const carVelocity = React.useRef(new THREE.Vector3());
  const wasInVehicle = React.useRef(false);
  const smoothSteer = React.useRef(0);
  const previousVehicleSpeed = React.useRef(0);
  const previousForwardSpeed = React.useRef(0);
  const cameraShake = React.useRef(0);
  const cameraYawLag = React.useRef(0);
  const brakeCameraKick = React.useRef(0);
  const cameraPos = React.useRef(new THREE.Vector3(-9, 2.77, 20));
  const smoothYaw = React.useRef(look.yaw);
  const smoothPitch = React.useRef(look.pitch);
  const headBob = React.useRef(0);
  const landingKick = React.useRef(0);
  const wasGroundedRef = React.useRef(true);
  const playerFrameClock = React.useRef(0);

  useFrame((_, raw) => {
    activeCamera = camera;
    const dt = Math.min(raw, .05);
    const s = useGame.getState();
    camera.rotation.order = 'YXZ';

    if (s.phase === 'cinematic') return;
    if (s.phase !== 'playing') {
      smoothYaw.current = THREE.MathUtils.damp(smoothYaw.current, look.yaw, 16, dt);
      smoothPitch.current = THREE.MathUtils.damp(smoothPitch.current, look.pitch, 16, dt);
      cameraPos.current.lerp(new THREE.Vector3(pos.current.x, 2.77, pos.current.z), 1 - Math.exp(-18 * dt));
      camera.position.copy(cameraPos.current);
      camera.rotation.set(smoothPitch.current, smoothYaw.current, 0);
      return;
    }

    if (s.inVehicle) {
      const r = vehicleRuntime;
      const throttle = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
      const steerTarget = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
      const handbrake = keys.has('Space');
      const maxForward = 24.0;
      const maxReverse = 9.2;
      const engineResponse = 7.2;
      const reverseResponse = 6.4;
      const brakeResponse = 11.5;
      const rollingResponse = 1.25;
      const wheelBase = 2.9;

      smoothSteer.current = THREE.MathUtils.damp(smoothSteer.current, steerTarget, 9.5, dt);
      const speedRatio = THREE.MathUtils.clamp(Math.abs(r.speed) / maxForward, 0, 1);
      const maxSteerAngle = THREE.MathUtils.lerp(0.64, 0.34, speedRatio);
      const steerAngle = smoothSteer.current * maxSteerAngle;

      if (s.fuel <= 0) {
        r.speed = THREE.MathUtils.damp(r.speed, 0, 4.2, dt);
      } else if (throttle > 0) {
        r.speed = THREE.MathUtils.damp(r.speed, maxForward, engineResponse, dt);
      } else if (throttle < 0) {
        if (r.speed > 0.65) r.speed = THREE.MathUtils.damp(r.speed, 0, brakeResponse, dt);
        else r.speed = THREE.MathUtils.damp(r.speed, -maxReverse, reverseResponse, dt);
      } else {
        r.speed = THREE.MathUtils.damp(r.speed, 0, rollingResponse, dt);
      }

      const braking = throttle < 0 && r.speed > 0.65;
      const brakeStrength = THREE.MathUtils.clamp(
        (Math.max(0, previousVehicleSpeed.current - Math.abs(r.speed)) / 8.0) + (braking ? 0.65 : 0) + (handbrake ? 0.35 : 0),
        0, 1,
      );

      if (Math.abs(r.speed) > 0.16) {
        const yawRate = (r.speed / wheelBase) * Math.tan(steerAngle);
        r.yaw += yawRate * dt;
      }

      const forward = new THREE.Vector3(Math.sin(r.yaw), 0, Math.cos(r.yaw));
      const right = new THREE.Vector3(Math.cos(r.yaw), 0, -Math.sin(r.yaw));
      const lateralVelocity = r.velocity.dot(right);
      const grip = handbrake ? 2.15 : THREE.MathUtils.lerp(13.5, 8.5, speedRatio);
      const correctedLateral = THREE.MathUtils.damp(lateralVelocity, 0, grip, dt);
      const driftPush = handbrake && Math.abs(r.speed) > 4 && Math.abs(smoothSteer.current) > 0.04
        ? smoothSteer.current * Math.abs(r.speed) * 0.16 : 0;
      r.velocity.copy(forward).multiplyScalar(r.speed).addScaledVector(right, correctedLateral + driftPush);

      const nx = THREE.MathUtils.clamp(r.x + r.velocity.x * dt, -148, 148);
      const nz = THREE.MathUtils.clamp(r.z + r.velocity.z * dt, -148, 148);
      if (!blocked(nx, nz)) {
        r.x = nx;
        r.z = nz;
      } else {
        const impact = Math.min(8, Math.max(1.2, Math.abs(r.speed) * 0.38));
        r.velocity.multiplyScalar(-0.18);
        r.speed *= -0.18;
        s.vehicleCondition = Math.max(0, s.vehicleCondition - impact);
        cameraShake.current = Math.min(1, cameraShake.current + 0.7);
        s.toast = `Impact • vehicle condition ${Math.round(s.vehicleCondition)}%`;
      }

      const speed = Math.abs(r.speed);
      const speedKmh = Math.round(speed * 3.6);
      const bodyRollTarget = THREE.MathUtils.clamp(-smoothSteer.current * (0.025 + speedRatio * 0.075), -0.11, 0.11);
      const accelDelta = (r.speed - previousForwardSpeed.current) / Math.max(dt, 0.001);
      const bodyPitchTarget = THREE.MathUtils.clamp(-accelDelta * 0.0032, -0.052, 0.045);
      const suspensionWave = Math.sin(performance.now() * 0.018 + r.x * 0.04 + r.z * 0.03) * Math.min(0.014, speedRatio * 0.014);
      r.roll = THREE.MathUtils.damp(r.roll, bodyRollTarget, 8.5, dt);
      r.pitch = THREE.MathUtils.damp(r.pitch, bodyPitchTarget + suspensionWave, 8.2, dt);
      r.steer = smoothSteer.current;
      r.wheelAngle = steerAngle;
      r.reverse = r.speed < -0.15;
      r.brake = brakeStrength > 0.16;
      r.wheelSpin += (r.speed / 0.38) * dt;
      r.fuel = Math.max(0, r.fuel - dt * (0.018 + speed / 430 + (throttle > 0 ? 0.028 : 0)));

      previousVehicleSpeed.current = speed;
      previousForwardSpeed.current = r.speed;
      brakeCameraKick.current = THREE.MathUtils.damp(brakeCameraKick.current, brakeStrength, 12, dt);
      wasInVehicle.current = true;

      if ((playerFrameClock.current += dt) >= 0.065) {
        playerFrameClock.current = 0;
        useGame.setState({
          vehicleX: r.x,
          vehicleZ: r.z,
          vehicleYaw: r.yaw,
          vehicleSpeed: speedKmh,
          vehicleSteer: r.steer,
          vehicleRoll: r.roll,
          vehiclePitch: r.pitch,
          vehicleWheelAngle: r.wheelAngle,
          vehicleReverse: r.reverse,
          vehicleBrake: r.brake,
          fuel: r.fuel,
          moving: speed > 0.25,
          sprint: false,
          playerX: r.x,
          playerZ: r.z,
        });
      }

      camera.fov = THREE.MathUtils.damp(camera.fov, s.vehicleView === 'third' ? 65.5 + Math.min(11, speedKmh * 0.10) : 64.5 + Math.min(6, speedKmh * 0.06), 5.8, dt);
      camera.updateProjectionMatrix();
      const shake = brakeCameraKick.current * (0.009 + speedRatio * 0.012) + cameraShake.current * 0.02;
      const sx = Math.sin(performance.now() * 0.043) * shake;
      const sy = Math.cos(performance.now() * 0.052) * shake * 0.75 - brakeCameraKick.current * 0.012;
      if (s.vehicleView === 'third') {
        const desired = new THREE.Vector3(r.x, 1.22, r.z).addScaledVector(forward, -8.8 - speedRatio * 2.8).add(new THREE.Vector3(sx, 3.0 + speedRatio * 0.62 + sy, 0));
        camera.position.lerp(desired, 1 - Math.exp(-7.8 * dt));
        const lookAhead = new THREE.Vector3(r.x, 1.22, r.z).addScaledVector(forward, 4.8 + speedRatio * 9.5).add(new THREE.Vector3(0, 0.25, 0));
        camera.lookAt(lookAhead);
        camera.rotation.z = THREE.MathUtils.damp(camera.rotation.z, -r.roll * 0.8 - smoothSteer.current * speedRatio * 0.018, 7.5, dt);
      } else {
        const first = new THREE.Vector3(r.x, 1.75, r.z).addScaledVector(forward, 0.4).add(new THREE.Vector3(sx * 0.55, 0.01 + sy, 0));
        camera.position.lerp(first, 1 - Math.exp(-12 * dt));
        camera.rotation.set(look.pitch * 0.68, r.yaw + look.yaw - Math.PI, -r.roll * 0.55);
      }
      return;
    }

    if (wasInVehicle.current) {
      pos.current.x = s.vehicleX;
      pos.current.y = 1.05;
      pos.current.z = s.vehicleZ;
      vel.current.set(0, 0, 0);
      carVelocity.current.set(0, 0, 0);
      smoothSteer.current = 0;
      previousVehicleSpeed.current = 0;
      previousForwardSpeed.current = 0;
      brakeCameraKick.current = 0;
      wasInVehicle.current = false;
    }

    if (s.flying) {
      const fFly = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
      const rFly = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
      const ascend = (keys.has('Space') ? 1 : 0) - ((keys.has('ControlLeft') || keys.has('ControlRight')) ? 1 : 0);
      const boost = keys.has('ShiftLeft') || keys.has('ShiftRight');
      const inputLen = Math.hypot(fFly, rFly);
      const maxAirSpeed = boost ? 18.5 : 12.0;
      let dirX = 0; let dirZ = 0;
      if (inputLen > 0) {
        const nf = fFly / inputLen; const nr = rFly / inputLen;
        dirX = -Math.sin(look.yaw) * nf + Math.cos(look.yaw) * nr;
        dirZ = -Math.cos(look.yaw) * nf - Math.sin(look.yaw) * nr;
      }
      const airAccel = inputLen > 0 ? 7.5 : 5.5;
      vel.current.x = THREE.MathUtils.damp(vel.current.x, dirX * maxAirSpeed, airAccel, dt);
      vel.current.z = THREE.MathUtils.damp(vel.current.z, dirZ * maxAirSpeed, airAccel, dt);
      vel.current.y = THREE.MathUtils.damp(vel.current.y, ascend * (boost ? 10 : 7.5), ascend !== 0 ? 7.5 : 4.5, dt);

      pos.current.x = THREE.MathUtils.clamp(pos.current.x + vel.current.x * dt, -148, 148);
      pos.current.z = THREE.MathUtils.clamp(pos.current.z + vel.current.z * dt, -148, 148);
      pos.current.y = THREE.MathUtils.clamp(pos.current.y + vel.current.y * dt, 2.8, 95);

      const airSpeed = Math.hypot(vel.current.x, vel.current.z, vel.current.y);
      const staminaDrain = dt * (boost ? 6.5 : 2.2);
      const nextEnergy = Math.max(0, s.energy - staminaDrain);
      if (nextEnergy <= 0) useGame.getState().toggleFlying();

      useGame.getState().tick(dt);
      useGame.setState({ playerX: pos.current.x, playerY: pos.current.y, playerZ: pos.current.z, moving: airSpeed > 0.18, sprint: boost, energy: nextEnergy });

      smoothYaw.current = THREE.MathUtils.damp(smoothYaw.current, look.yaw, 14, dt);
      smoothPitch.current = THREE.MathUtils.damp(smoothPitch.current, look.pitch, 12, dt);
      headBob.current += dt * (4.5 + Math.min(7, airSpeed));
      const flap = Math.sin(headBob.current * 1.6) * 0.02;
      const cameraTarget = new THREE.Vector3(pos.current.x, pos.current.y + 1.2 + flap, pos.current.z);
      const forwardAir = new THREE.Vector3(-Math.sin(look.yaw), 0, -Math.cos(look.yaw));
      const chase = cameraTarget.clone().addScaledVector(forwardAir, 6.8 + airSpeed * 0.18).add(new THREE.Vector3(0, 2.8 + airSpeed * 0.06, 0));
      camera.position.lerp(chase, 1 - Math.exp(-6.5 * dt));
      camera.lookAt(cameraTarget);
      camera.fov = THREE.MathUtils.damp(camera.fov, 69 + (boost ? 8 : airSpeed * 0.12), 5, dt);
      camera.updateProjectionMatrix();
      return;
    }

    // Interior movement: lock the player to the active floor while allowing smooth stair climbing.
    if (s.insideBuilding) {
      const fIn = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
      const rIn = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
      const lenIn = Math.hypot(fIn, rIn);
      const maxIn = (keys.has('ShiftLeft') || keys.has('ShiftRight')) ? 5.4 : 4.1;
      let inDX = 0; let inDZ = 0;
      if (lenIn > 0) {
        const nf = fIn / lenIn; const nr = rIn / lenIn;
        inDX = -Math.sin(look.yaw) * nf + Math.cos(look.yaw) * nr;
        inDZ = -Math.cos(look.yaw) * nf - Math.sin(look.yaw) * nr;
      }
      const inAccel = lenIn > 0 ? 12 : 18;
      vel.current.x = THREE.MathUtils.damp(vel.current.x, inDX * maxIn, inAccel, dt);
      vel.current.z = THREE.MathUtils.damp(vel.current.z, inDZ * maxIn, inAccel, dt);
      const nxIn = THREE.MathUtils.clamp(pos.current.x + vel.current.x * dt, ENTERABLE_BUILDING.x - ENTERABLE_BUILDING.w / 2 + 1.1, ENTERABLE_BUILDING.x + ENTERABLE_BUILDING.w / 2 - 1.1);
      const nzIn = THREE.MathUtils.clamp(pos.current.z + vel.current.z * dt, ENTERABLE_BUILDING.z - ENTERABLE_BUILDING.d / 2 + 1.1, ENTERABLE_BUILDING.z + ENTERABLE_BUILDING.d / 2 - 1.1);
      if (!blocked(nxIn, nzIn, true)) { pos.current.x = nxIn; pos.current.z = nzIn; }
      const stairY = stairHeight(pos.current.x, pos.current.z);
      const targetFloorY = BUILDING_FLOOR_BASE_Y + s.buildingFloor * BUILDING_FLOOR_H;
      if (stairY !== null) {
        pos.current.y = THREE.MathUtils.damp(pos.current.y, stairY, 9, dt);
        useGame.setState({ buildingFloor: Math.max(0, Math.min(3, Math.round((pos.current.y - BUILDING_FLOOR_BASE_Y) / BUILDING_FLOOR_H))) });
      } else {
        pos.current.y = THREE.MathUtils.damp(pos.current.y, targetFloorY, 14, dt);
      }
      const horizontalIn = Math.hypot(vel.current.x, vel.current.z);
      useGame.getState().tick(dt);
      smoothYaw.current = THREE.MathUtils.damp(smoothYaw.current, look.yaw, 22, dt);
      smoothPitch.current = THREE.MathUtils.damp(smoothPitch.current, look.pitch, 20, dt);
      if (horizontalIn > 0.14) headBob.current += dt * 8.6;
      const bob = horizontalIn > 0.14 ? Math.sin(headBob.current) * .018 : 0;
      camera.position.lerp(new THREE.Vector3(pos.current.x, pos.current.y + 1.72 + bob, pos.current.z), 1 - Math.exp(-20 * dt));
      camera.rotation.set(smoothPitch.current, smoothYaw.current, 0);
      useGame.setState({ moving: horizontalIn > 0.14, sprint: false, playerX: pos.current.x, playerZ: pos.current.z });
      return;
    }

    const f = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const r = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const sprint = (keys.has('ShiftLeft') || keys.has('ShiftRight')) && s.energy > 2 && f > 0;
    const inputLen = Math.hypot(f, r);
    const maxSpeed = sprint ? 9.4 : 6.15;
    let dirX = 0; let dirZ = 0;
    if (inputLen > 0) {
      const nf = f / inputLen; const nr = r / inputLen;
      dirX = -Math.sin(look.yaw) * nf + Math.cos(look.yaw) * nr;
      dirZ = -Math.cos(look.yaw) * nf - Math.sin(look.yaw) * nr;
    }
    const accel = inputLen > 0 ? (sprint ? 15.0 : 13.5) : 21.0;
    vel.current.x = THREE.MathUtils.damp(vel.current.x, dirX * maxSpeed, accel, dt);
    vel.current.z = THREE.MathUtils.damp(vel.current.z, dirZ * maxSpeed, accel, dt);

    const nx = THREE.MathUtils.clamp(pos.current.x + vel.current.x * dt, -148, 148);
    if (!blocked(nx, pos.current.z)) pos.current.x = nx; else vel.current.x *= 0.12;
    const nz = THREE.MathUtils.clamp(pos.current.z + vel.current.z * dt, -148, 148);
    if (!blocked(pos.current.x, nz)) pos.current.z = nz; else vel.current.z *= 0.12;

    const jump = keys.has('Space');
    if (jump && !jumpHeld.current && grounded.current) { vel.current.y = 8.6; grounded.current = false; }
    jumpHeld.current = jump;
    vel.current.y += -24 * dt;
    pos.current.y += vel.current.y * dt;
    const wasGrounded = wasGroundedRef.current;
    if (pos.current.y <= 1.05) {
      const impact = Math.abs(vel.current.y);
      pos.current.y = 1.05; vel.current.y = 0; grounded.current = true;
      if (!wasGrounded) landingKick.current = THREE.MathUtils.clamp(impact * 0.01, 0.06, 0.18);
    } else grounded.current = false;
    wasGroundedRef.current = grounded.current;

    const horizontalSpeed = Math.hypot(vel.current.x, vel.current.z);
    const speedRatio = THREE.MathUtils.clamp(horizontalSpeed / maxSpeed, 0, 1);
    const moving = horizontalSpeed > 0.14;
    // Keep the authoritative player position synchronized with the smooth local controller.
    // The previous build only moved the camera/physics position, so interaction checks
    // (especially entering the van) continued using the original spawn coordinates.
    useGame.setState({ moving, sprint, playerX: pos.current.x, playerY: pos.current.y, playerZ: pos.current.z });
    useGame.getState().tick(dt);

    smoothYaw.current = THREE.MathUtils.damp(smoothYaw.current, look.yaw, 22, dt);
    smoothPitch.current = THREE.MathUtils.damp(smoothPitch.current, look.pitch, 20, dt);
    landingKick.current = THREE.MathUtils.damp(landingKick.current, 0, 12, dt);
    if (grounded.current && moving) headBob.current += dt * (sprint ? 13.2 : 9.3) * (0.28 + speedRatio);
    const bobAmp = grounded.current ? speedRatio * (sprint ? 0.055 : 0.035) : 0;
    const bobX = Math.cos(headBob.current * 0.5) * bobAmp * 0.5;
    const bobY = Math.sin(headBob.current) * bobAmp - landingKick.current * 0.09;
    const strafeRoll = THREE.MathUtils.clamp(-r * speedRatio * 0.024, -0.024, 0.024);
    combatCameraKick = THREE.MathUtils.damp(combatCameraKick, 0, 22, dt);
    const fireKickY = combatCameraKick * 0.018;
    const fireKickZ = combatCameraKick * 0.035;
    cameraPos.current.lerp(new THREE.Vector3(pos.current.x + bobX, pos.current.y + 1.72 + bobY + fireKickY, pos.current.z - fireKickZ), 1 - Math.exp(-24 * dt));
    camera.position.copy(cameraPos.current);
    camera.rotation.set(smoothPitch.current, smoothYaw.current, strafeRoll);
    camera.fov = THREE.MathUtils.damp(camera.fov, 66 + (sprint ? 4.2 : speedRatio * 1.3), 7, dt);
    camera.updateProjectionMatrix();
  });
  return null;
}

function CinematicCamera() {
  const { camera } = useThree();
  const last = React.useRef('none');
  useFrame((_, raw) => {
    activeCamera = camera;
    const dt = Math.min(raw, .05);
    const s = useGame.getState();
    if (s.phase !== 'cinematic' || s.cinematic === 'none') return;
    const elapsed = (performance.now() - s.cinematicStartedAt) / 1000;
    if (last.current !== s.cinematic) {
      last.current = s.cinematic;
      camera.position.set(s.vehicleX + 10, 7, s.vehicleZ + 10);
    }
    if (s.cinematic === 'arrival') {
      const t = Math.min(1, elapsed / 5.5);
      const eased = t * t * (3 - 2 * t);
      const p = new THREE.Vector3(18 - eased * 27, 7.5 - eased * 4.3, 40 - eased * 19);
      const target = new THREE.Vector3(19 - eased * 17, 3.7 - eased * 1.2, 20 - eased * 6);
      camera.position.lerp(p, 1 - Math.exp(-7 * dt));
      camera.lookAt(target);
      if (elapsed > 5.6) s.finishCinematic();
    } else if (s.cinematic === 'enterVehicle') {
      const t = Math.min(1, elapsed / 1.6);
      const f = new THREE.Vector3(-Math.sin(s.vehicleYaw), 0, -Math.cos(s.vehicleYaw));
      const side = new THREE.Vector3(f.z, 0, -f.x);
      const p = new THREE.Vector3(s.vehicleX, 2.7, s.vehicleZ).addScaledVector(f, -5.5).addScaledVector(side, 1.6 * (1 - t));
      camera.position.lerp(p, 1 - Math.exp(-10 * dt));
      camera.lookAt(new THREE.Vector3(s.vehicleX, 1.0, s.vehicleZ));
      if (elapsed > 1.7) s.finishCinematic();
    } else if (s.cinematic === 'deliveryComplete') {
      const t = Math.min(1, elapsed / 3.5);
      const angle = t * Math.PI * .9;
      const p = new THREE.Vector3(DELIVERY.x + Math.cos(angle) * 9, 4.2, DELIVERY.z + Math.sin(angle) * 9);
      camera.position.lerp(p, 1 - Math.exp(-7 * dt));
      camera.lookAt(new THREE.Vector3(DELIVERY.x, 1.0, DELIVERY.z));
      if (elapsed > 3.6) s.finishCinematic();
    }
  });
  return null;
}

function Grain({ color, repeat = 1 }: { color: string; repeat?: number }) {
  const tex = React.useMemo(() => {
    const c = document.createElement('canvas');
    c.width = c.height = 160;
    const x = c.getContext('2d')!;
    x.fillStyle = color; x.fillRect(0, 0, 160, 160);
    for (let i = 0; i < 900; i++) {
      x.globalAlpha = .04 + (i % 5) * .008;
      x.fillStyle = i % 2 ? '#fff' : '#000';
      x.fillRect((i * 37) % 160, (i * 71) % 160, 1 + (i % 3), 1 + (i % 3));
    }
    x.globalAlpha = 1;
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, [color, repeat]);
  return <primitive attach="map" object={tex} />;
}

function Windows({ w, h, d, warm }: { w: number; h: number; d: number; warm: boolean }) {
  const rows = Math.max(5, Math.floor(h / 4.5));
  const cols = Math.max(4, Math.floor(w / 4.1));
  const depth = d / 2 + .035;
  return <group position={[0, 0, -depth]}>{Array.from({ length: rows * cols }, (_, i) => {
    const c = i % cols; const r = Math.floor(i / cols); const lit = (i * 7 + r * 3) % 11 < 4;
    return <mesh key={i} position={[-w / 2 + 2 + c * ((w - 4) / Math.max(1, cols - 1)), -h / 2 + 2.45 + r * ((h - 4.9) / Math.max(1, rows - 1)), .02]}>
      <boxGeometry args={[Math.min(1.35, (w - 4) / cols * .58), Math.min(1.4, (h - 4.9) / rows * .58), .08]} />
      <meshStandardMaterial color={lit ? (warm ? '#e7b96d' : '#89b9c9') : '#263237'} emissive={lit ? (warm ? '#9a6529' : '#285464') : '#000'} emissiveIntensity={lit ? .78 : 0} roughness={.25} metalness={.18} />
    </mesh>;
  })}</group>;
}

function Building({ x, z, w, d, h, accent, label, dark = false, glass = false }: { x: number; z: number; w: number; d: number; h: number; accent: string; label?: string; dark?: boolean; glass?: boolean }) {
  const base = glass ? '#4a626d' : dark ? '#566269' : '#77716a';
  return <group position={[x, h / 2, z]}>
    <mesh castShadow receiveShadow>
      <boxGeometry args={[w, h, d]} />
      <meshStandardMaterial color={base} roughness={glass ? .36 : .58} metalness={glass ? .18 : .05} emissive={dark ? '#131a1e' : '#090b0d'} emissiveIntensity={dark ? .16 : .06}>
        <Grain color={glass ? '#3b4c55' : dark ? '#404a50' : '#716c65'} repeat={Math.max(2, Math.floor(w / 6))} />
      </meshStandardMaterial>
    </mesh>
    <mesh position={[0, -h / 2 + 2.1, -d / 2 - .08]}><boxGeometry args={[w * .92, 4.0, .18]} /><meshStandardMaterial color="#20262b" roughness={.34} /></mesh>
    <Windows w={w} h={h} d={d} warm={!dark} />
    <group rotation-y={Math.PI / 2}><Windows w={d} h={h} d={w} warm={!dark} /></group>
    {Array.from({ length: 3 }, (_, i) => <mesh key={`band-${i}`} position={[0, -h / 2 + 7 + i * Math.min(8, h / 8), -d / 2 - .11]}><boxGeometry args={[w * .96, .08, .05]} /><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={.32} /></mesh>)}
    <mesh position={[0, h / 2 + .55, 0]} castShadow><boxGeometry args={[w * .82, 1.05, d * .82]} /><meshStandardMaterial color="#4a4d50" roughness={.72} /></mesh>
    <mesh position={[-w * .28, h / 2 + .95, d * .12]} castShadow><boxGeometry args={[2.3, 1.1, 1.5]} /><meshStandardMaterial color="#555a5d" roughness={.8} /></mesh>
    <mesh position={[w * .24, h / 2 + .82, -d * .15]} castShadow><boxGeometry args={[1.8, 1.0, 1.4]} /><meshStandardMaterial color="#4d5357" roughness={.8} /></mesh>
    {label && <group position={[0, -h / 2 + 4.3, -d / 2 - .26]}><mesh><boxGeometry args={[Math.min(w * .76, label.length * .54), 1.02, .08]} /><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.15} /></mesh></group>}
    <mesh position={[0, -h / 2 + 1.35, -d / 2 - .16]}><boxGeometry args={[Math.min(10, w * .46), 1.85, .12]} /><meshStandardMaterial color="#13191d" /></mesh>
  </group>;
}

function Storefront({ x, z, rotation = 0, sign = 'CAFÉ', accent = '#f2c96f' }: { x: number; z: number; rotation?: number; sign?: string; accent?: string }) {
  return <group position={[x, 0, z]} rotation-y={rotation}>
    <mesh position-y={1.4} castShadow><boxGeometry args={[9.4, 2.8, 3.5]} /><meshStandardMaterial color="#2b3338" roughness={.38} /></mesh>
    <mesh position-y={2.86}><boxGeometry args={[9.8, .18, 3.6]} /><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.3} /></mesh>
    <mesh position={[0, 1.35, -1.8]}><boxGeometry args={[7.7, 1.72, .08]} /><meshStandardMaterial color="#1e2b31" roughness={.22} metalness={.3} /></mesh>
    {[-2.6, 0, 2.6].map((px) => <mesh key={px} position={[px, 1.35, -1.86]}><boxGeometry args={[1.78, 1.32, .05]} /><meshStandardMaterial color="#9ec8d4" roughness={.18} metalness={.18} emissive="#345861" emissiveIntensity={.18} /></mesh>)}
    <mesh position={[0, .63, -1.92]}><boxGeometry args={[1.6, 1.05, .06]} /><meshStandardMaterial color="#101519" /></mesh>
    <group position={[0, 3.34, -1.9]}><mesh><boxGeometry args={[Math.min(6.4, sign.length * .72), .58, .08]} /><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.6} /></mesh></group>
    <group position={[-3.6, 1.15, -1.95]}>{[-1.5, 0, 1.5].map((px) => <mesh key={px} position={[px, 0, 0]} castShadow><coneGeometry args={[.62, 1.75, 8]} /><meshStandardMaterial color="#20573b" roughness={.9} /></mesh>)}</group>
  </group>;
}

function Palm({ x, z, s = 1, lean = 0 }: { x: number; z: number; s?: number; lean?: number }) {
  const ref = React.useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const sway = Math.sin(clock.elapsedTime * 0.75 + x * 0.031 + z * 0.017) * 0.022 + Math.sin(clock.elapsedTime * 1.35 + z * 0.022) * 0.008;
    ref.current.rotation.z = lean + sway;
    ref.current.rotation.x = Math.cos(clock.elapsedTime * 0.62 + x * 0.02) * 0.008;
  });
  return <group ref={ref} position={[x, 0, z]} rotation-z={lean} scale={s}>
    <mesh position-y={3.1} castShadow><cylinderGeometry args={[.15, .28, 6.2, 10]} /><meshStandardMaterial color="#68472f" roughness={1} /></mesh>
    {Array.from({ length: 8 }, (_, i) => <mesh key={i} position-y={6.1} rotation={[.15, (i / 8) * Math.PI * 2, i % 2 ? .38 : -.38]}><coneGeometry args={[.33, 3.7, 5]} /><meshStandardMaterial color={i % 2 ? '#285438' : '#356b45'} roughness={.95} /></mesh>)}
  </group>;
}

function TreePlanter({ x, z }: { x: number; z: number }) {
  const canopy = React.useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!canopy.current) return;
    const sway = 1 + Math.sin(clock.elapsedTime * 1.1 + x * 0.03 + z * 0.02) * 0.025;
    canopy.current.scale.set(sway, 1 + Math.cos(clock.elapsedTime * 1.0 + z * 0.02) * 0.018, sway);
    canopy.current.rotation.y = clock.elapsedTime * 0.08 + x * 0.01;
  });
  return <group position={[x, .25, z]}><mesh castShadow><boxGeometry args={[1.5, .55, 1.5]} /><meshStandardMaterial color="#55514a" roughness={.9} /></mesh><mesh position-y={1.05}><cylinderGeometry args={[.42, .55, 1.7, 10]} /><meshStandardMaterial color="#5a412d" /></mesh><mesh ref={canopy} position-y={2.1}><sphereGeometry args={[1.0, 14, 10]} /><meshStandardMaterial color="#2f6845" roughness={1} /></mesh></group>;
}

function Bench({ x, z, rotation = 0 }: { x: number; z: number; rotation?: number }) {
  return <group position={[x, .35, z]} rotation-y={rotation}><mesh position-y={.55}><boxGeometry args={[2.8, .16, .48]} /><meshStandardMaterial color="#76583d" /></mesh>{[-.9, .9].map((px) => <mesh key={px} position={[px, .15, 0]}><boxGeometry args={[.12, .8, .18]} /><meshStandardMaterial color="#252a2d" /></mesh>)}</group>;
}

function Bin({ x, z }: { x: number; z: number }) { return <mesh position={[x, .62, z]} castShadow><cylinderGeometry args={[.34, .38, 1.25, 12]} /><meshStandardMaterial color="#263238" roughness={.8} /></mesh>; }

function StreetLight({ x, z, flip = false, double = false }: { x: number; z: number; flip?: boolean; double?: boolean }) {
  const bulb = React.useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    if (!bulb.current) return;
    bulb.current.intensity = 2.45 + Math.sin(clock.elapsedTime * 0.7 + x * 0.02 + z * 0.015) * 0.08;
  });
  return <group position={[x, 0, z]} rotation-y={flip ? Math.PI : 0}>
    <mesh position-y={2.7} castShadow><cylinderGeometry args={[.07, .11, 5.4, 10]} /><meshStandardMaterial color="#20272a" metalness={.78} roughness={.32} /></mesh>
    <mesh position={[.42, 5.28, 0]} rotation-z={Math.PI / 2}><cylinderGeometry args={[.05, .05, .82, 8]} /><meshStandardMaterial color="#20272a" /></mesh>
    <mesh position={[.84, 5.2, 0]}><boxGeometry args={[.5, .17, .28]} /><meshStandardMaterial color="#ffd780" emissive="#ffb74a" emissiveIntensity={2} /></mesh>
    <pointLight ref={bulb} position={[.84, 4.95, 0]} intensity={2.6} distance={9} color="#ffc46e" decay={2} />
    {double && <><mesh position={[-.42, 5.28, 0]} rotation-z={Math.PI / 2}><cylinderGeometry args={[.05, .05, .82, 8]} /><meshStandardMaterial color="#20272a" /></mesh><mesh position={[-.84, 5.2, 0]}><boxGeometry args={[.5, .17, .28]} /><meshStandardMaterial color="#ffd780" emissive="#ffb74a" emissiveIntensity={2} /></mesh></>}
  </group>;
}

function Car({ color = '#b43a34', compact = false }: { color?: string; compact?: boolean }) {
  const s = compact ? .92 : 1;
  return <group scale={s}>
    <mesh position-y={.5} castShadow><boxGeometry args={[1.8, .55, 4]} /><meshStandardMaterial color={color} metalness={.48} roughness={.24} /></mesh>
    <mesh position={[0, .95, -.2]} castShadow><boxGeometry args={[1.5, .55, 1.8]} /><meshStandardMaterial color="#27353c" metalness={.55} roughness={.16} /></mesh>
    {[[-.9, .33, 1.18], [.9, .33, 1.18], [-.9, .33, -1.18], [.9, .33, -1.18]].map((pp, i) => <mesh key={i} position={pp as [number, number, number]} rotation-z={Math.PI / 2}><cylinderGeometry args={[.34, .34, .22, 16]} /><meshStandardMaterial color="#151719" roughness={.84} /></mesh>)}
    <mesh position={[0, .63, 2.02]}><boxGeometry args={[1.15, .13, .05]} /><meshStandardMaterial color="#ffe8a3" emissive="#ffd574" emissiveIntensity={1.5} /></mesh>
    <mesh position={[0, .58, -2.02]}><boxGeometry args={[1.0, .1, .05]} /><meshStandardMaterial color="#ff6a55" emissive="#b63329" emissiveIntensity={1.1} /></mesh>
  </group>;
}

function DeliveryVan() {
  const steer = useGame((state) => state.vehicleWheelAngle);
  const roll = useGame((state) => state.vehicleRoll);
  const pitch = useGame((state) => state.vehiclePitch);
  const speed = useGame((state) => state.vehicleSpeed);
  const vehicleReverse = useGame((state) => state.vehicleReverse);
  const fuel = useGame((state) => state.fuel);
  const inVehicle = useGame((state) => state.inVehicle);
  const vehicleView = useGame((state) => state.vehicleView);
  const brakeActive = useGame((state) => state.vehicleBrake);
  const lightsOn = useGame((state) => state.lightsOn);
  const spin = React.useRef(0);

  useFrame((_, dt) => {
    const signedMetersPerSecond = (speed / 3.6) * (vehicleReverse ? -1 : 1);
    spin.current += (signedMetersPerSecond / 0.38) * dt;
    spin.current = THREE.MathUtils.euclideanModulo(spin.current + Math.PI, Math.PI * 2) - Math.PI;
  });

  // Brake lights follow the actual braking state; body motion stays close to the proven v0.7 feel.
  const brakeGlow = brakeActive;
  const turnGlow = Math.min(1, Math.abs(steer) * 1.4);
  // Steering wheel follows the same direction as vehicle/front-wheel steering.
  // A=left => positive Z rotation (left); D=right => negative Z rotation (right).
  const steeringWheelRotation = steer * 1.72;

  const cinematicPitch = pitch * 0.45;
  return <group rotation-z={roll} rotation-x={cinematicPitch}>
    <mesh position-y={.82} castShadow><boxGeometry args={[2.0, 1.25, 4.4]} /><meshStandardMaterial color="#d7dce0" roughness={.25} metalness={.2} /></mesh>
    <mesh position={[0, 1.5, -.54]} castShadow><boxGeometry args={[1.64, .68, 1.55]} /><meshStandardMaterial color="#27353c" metalness={.5} roughness={.14} /></mesh>
    <mesh position={[0, 1.03, 1.42]}><boxGeometry args={[1.62, .66, .07]} /><meshStandardMaterial color="#5d7d8a" roughness={.18} metalness={.3} /></mesh>
    <mesh position={[0, 1.08, -2.18]}><boxGeometry args={[1.25, .58, .08]} /><meshStandardMaterial color="#355f78" emissive="#173a4e" emissiveIntensity={.55} /></mesh>
    <mesh position={[0, 1.2, 2.21]}><boxGeometry args={[1.4, .7, .05]} /><meshStandardMaterial color="#f0ca73" emissive="#d6a846" emissiveIntensity={.85} /></mesh>
    {[-.62, .62].map((x) => <group key={`lamp-${x}`} position={[x, 1.02, 2.26]}><mesh><sphereGeometry args={[.11, 12, 10]} /><meshStandardMaterial color="#fff3c2" emissive="#ffe18b" emissiveIntensity={lightsOn ? 3.2 : .5} /></mesh>{lightsOn && <pointLight color="#fff0c4" intensity={2.2} distance={9} decay={2} />}</group>)}
    <mesh position={[0, .98, 2.23]}><boxGeometry args={[.9, .08, .05]} /><meshStandardMaterial color="#182126" /></mesh>
    {[-1, 1].map((side) => <group key={side} position={[side * 1.14, 1.43, .12]}><mesh><boxGeometry args={[.16, .3, .32]} /><meshStandardMaterial color="#22292d" metalness={.7} roughness={.18} /></mesh><mesh position-z={.06}><boxGeometry args={[.08, .17, .2]} /><meshStandardMaterial color="#91aeb8" roughness={.12} metalness={.25} /></mesh></group>)}
    {[[-1.0, .38, 1.35], [1.0, .38, 1.35]].map((pp, i) => (
      <group key={`front-${i}`} position={pp as [number, number, number]} rotation-y={steer}>
        <group rotation-x={spin.current}>
          <mesh rotation-z={Math.PI / 2}>
            <cylinderGeometry args={[.38, .38, .24, 18]} />
            <meshStandardMaterial color="#151719" roughness={.82} />
          </mesh>
          <mesh rotation-z={Math.PI / 2}>
            <cylinderGeometry args={[.19, .19, .25, 18]} />
            <meshStandardMaterial color="#8c8f91" metalness={.65} roughness={.28} />
          </mesh>
        </group>
      </group>
    ))}
    {[[-1.0, .38, -1.35], [1.0, .38, -1.35]].map((pp, i) => (
      <group key={`rear-${i}`} position={pp as [number, number, number]}>
        <group rotation-x={spin.current}>
          <mesh rotation-z={Math.PI / 2}>
            <cylinderGeometry args={[.38, .38, .24, 18]} />
            <meshStandardMaterial color="#151719" roughness={.82} />
          </mesh>
        </group>
      </group>
    ))}
    <mesh position-y={1.05}><boxGeometry args={[1.35, .12, 4.22]} /><meshStandardMaterial color="#2f6f8a" /></mesh>
    <mesh position={[0, .4, .0]}><boxGeometry args={[1.55, .25, 3.7]} /><meshStandardMaterial color="#1e2529" roughness={.7} /></mesh>
    <mesh position={[-.62, .88, -2.2]} scale={brakeGlow ? [1.12, 1.05, 1.12] : [1,1,1]}><boxGeometry args={[.34, .28, .05]} /><meshStandardMaterial color="#9b302a" emissive={brakeGlow ? '#a72e24' : '#300b0a'} emissiveIntensity={brakeGlow ? 2.2 : .15} /></mesh>
    <mesh position={[.62, .88, -2.2]} scale={brakeGlow ? [1.12, 1.05, 1.12] : [1,1,1]}><boxGeometry args={[.34, .28, .05]} /><meshStandardMaterial color="#9b302a" emissive={brakeGlow ? '#a72e24' : '#300b0a'} emissiveIntensity={brakeGlow ? 2.2 : .15} /></mesh>
    <mesh position={[0, .62, 2.22]}><boxGeometry args={[1.5, .26, .1]} /><meshStandardMaterial color="#22292d" metalness={.55} roughness={.3} /></mesh>
    {[-.38, 0, .38].map((x) => <mesh key={x} position={[x, .62, 2.29]}><boxGeometry args={[.05, .16, .03]} /><meshStandardMaterial color="#70767a" metalness={.8} roughness={.2} /></mesh>)}

    {inVehicle && vehicleView === 'first' && (
      <group position={[0, 1.18, .92]}>
        <mesh position={[0, .02, .03]} castShadow>
          <boxGeometry args={[1.72, .3, .26]} />
          <meshStandardMaterial color="#171d21" roughness={.38} metalness={.22} />
        </mesh>
        <mesh position={[0, .15, -.11]}>
          <boxGeometry args={[.78, .14, .03]} />
          <meshStandardMaterial color="#080d10" emissive="#153c4a" emissiveIntensity={.3} />
        </mesh>
        <mesh position={[0, .58, 0.03]} rotation-x={-0.14}>
          <torusGeometry args={[.34, .055, 12, 32]} />
          <meshStandardMaterial color="#151a1d" metalness={.7} roughness={.24} />
        </mesh>
        <mesh position={[0, .58, 0.01]} rotation-x={-0.14} rotation-z={steeringWheelRotation}>
          <torusGeometry args={[.33, .045, 12, 28]} />
          <meshStandardMaterial color="#252b2f" metalness={.65} roughness={.28} />
        </mesh>
        {[-0.18, 0.18].map((x) => (
          <mesh key={x} position={[x * Math.cos(steeringWheelRotation), .58 + x * Math.sin(steeringWheelRotation), .0]} rotation-z={steeringWheelRotation}>
            <boxGeometry args={[.46, .055, .07]} />
            <meshStandardMaterial color="#343b40" metalness={.55} roughness={.3} />
          </mesh>
        ))}
        <mesh position={[0, .58, -.045]} rotation-x={Math.PI / 2}>
          <cylinderGeometry args={[.09, .09, .06, 20]} />
          <meshStandardMaterial color="#c4a352" metalness={.72} roughness={.22} emissive="#6e5218" emissiveIntensity={.2} />
        </mesh>
        <mesh position={[-.72, .6, -.08]}>
          <boxGeometry args={[.12, .12, .12]} />
          <meshStandardMaterial color="#d9962c" emissive="#8b5a13" emissiveIntensity={turnGlow * .8} />
        </mesh>
        <mesh position={[.72, .6, -.08]}>
          <boxGeometry args={[.12, .12, .12]} />
          <meshStandardMaterial color="#d9962c" emissive="#8b5a13" emissiveIntensity={turnGlow * .8} />
        </mesh>
        <mesh position={[0, .84, -.1]}>
          <boxGeometry args={[.28, .06, .12]} />
          <meshStandardMaterial color="#f4c969" emissive="#c8922f" emissiveIntensity={.85} />
        </mesh>
        <mesh position={[.42, .84, -.1]}>
          <boxGeometry args={[.18, .06, .12]} />
          <meshStandardMaterial color={speed > 0 ? "#a8d9e4" : "#32434a"} emissive={speed > 0 ? "#4f8a98" : "#0b1114"} emissiveIntensity={speed > 0 ? .35 : 0} />
        </mesh>
        <mesh position={[-.42, .84, -.1]}>
          <boxGeometry args={[.18, .06, .12]} />
          <meshStandardMaterial color={fuel > 20 ? "#92b59c" : "#d05c44"} emissive={fuel > 20 ? "#345742" : "#7b261d"} emissiveIntensity={fuel > 20 ? .2 : .65} />
        </mesh>
        <mesh position={[-.38, .45, -.12]} rotation-x={-0.2}>
          <torusGeometry args={[.14, .035, 8, 18, Math.PI * 1.35]} />
          <meshStandardMaterial color="#5c6468" metalness={.65} roughness={.3} />
        </mesh>
        <mesh position={[-.38, .45, -.125]} rotation-x={-0.2} rotation-z={Math.PI * (-0.68 + Math.min(1.2, speed / 65) * 1.36)}>
          <boxGeometry args={[.025, .02, .16]} />
          <meshStandardMaterial color="#f4c969" emissive="#c78f2f" emissiveIntensity={.7} />
        </mesh>
        <mesh position={[.38, .45, -.12]} rotation-x={-0.2}>
          <torusGeometry args={[.14, .035, 8, 18, Math.PI * 1.35]} />
          <meshStandardMaterial color="#5c6468" metalness={.65} roughness={.3} />
        </mesh>
        <mesh position={[.38, .45, -.125]} rotation-x={-0.2} rotation-z={Math.PI * (-0.68 + Math.min(1.2, fuel / 100) * 1.36)}>
          <boxGeometry args={[.025, .02, .16]} />
          <meshStandardMaterial color="#78d0a0" emissive="#2b7a52" emissiveIntensity={.45} />
        </mesh>
      </group>
    )}
  </group>;
}

function Traffic() {
  const cars = React.useMemo(() => Array.from({ length: 8 }, (_, i) => ({ lane: i % 2 ? -3.7 : 3.7, z: -70 - i * 16, speed: 4.0 + (i % 3) * 1.25, color: ['#315f7a', '#c9b36e', '#8b3038', '#727e85', '#3d6048', '#d07e3d', '#5866a0', '#a1a6ad'][i] })), []);
  const refs = React.useRef<THREE.Group[]>([]);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    refs.current.forEach((g, i) => { if (!g) return; g.position.z = ((t * cars[i].speed + 86 + i * 17) % 172) - 86; g.rotation.y = i % 2 ? Math.PI : 0; });
  });
  return <>{cars.map((c, i) => <group key={i} ref={(g) => { if (g) refs.current[i] = g; }} position={[c.lane, .12, c.z]}><Car color={c.color} compact={i % 2 === 0} /></group>)}</>;
}

function NPCs() {
  const agents = React.useMemo(() => Array.from({ length: 24 }, (_, i) => ({ baseX: i % 2 ? 12.5 : -12.5, z0: -58 + (i * 11) % 112, dir: i % 2 ? 1 : -1, speed: .52 + (i % 4) * .14, color: ['#577b91', '#9b5a4b', '#6b7b51', '#735a82', '#9d744c'][i % 5] })), []);
  const refs = React.useRef<THREE.Group[]>([]);
  const legRefs = React.useRef<THREE.Group[]>([]);
  const armRefs = React.useRef<THREE.Group[]>([]);
  const torsoRefs = React.useRef<THREE.Group[]>([]);
  useFrame((state, dt) => refs.current.forEach((g, i) => {
    if (!g) return;
    const p = agents[i];
    g.position.z += p.dir * p.speed * dt;
    if (g.position.z > 61) g.position.z = -61;
    if (g.position.z < -61) g.position.z = 61;
    g.rotation.y = p.dir > 0 ? 0 : Math.PI;
    const walk = Math.sin(state.clock.elapsedTime * (4.5 + p.speed * 2.2) + i * .8) * .35;
    legRefs.current[i]?.rotation.set(walk, 0, 0);
    armRefs.current[i]?.rotation.set(-walk * .72, 0, 0);
    const torso = torsoRefs.current[i];
    if (torso) {
      torso.rotation.z = Math.sin(state.clock.elapsedTime * 2.1 + i * .31) * .03;
      torso.rotation.x = Math.cos(state.clock.elapsedTime * 1.8 + i * .19) * .016;
    }
  }));
  return <>{agents.map((p, i) => <group key={i} ref={(g) => { if (g) refs.current[i] = g; }} position={[p.baseX, .2, p.z0]}>
    <group ref={(g) => { if (g) legRefs.current[i] = g; }}>
      <mesh position={[-.11, .52, 0]} castShadow><boxGeometry args={[.13, .7, .13]} /><meshStandardMaterial color="#28333a" /></mesh>
      <mesh position={[.11, .52, 0]} castShadow><boxGeometry args={[.13, .7, .13]} /><meshStandardMaterial color="#28333a" /></mesh>
    </group>
    <group ref={(g) => { if (g) torsoRefs.current[i] = g; }}><mesh position-y={1.18} castShadow><capsuleGeometry args={[.2, .78, 4, 8] as any} /><meshStandardMaterial color={p.color} /></mesh></group>
    <group ref={(g) => { if (g) armRefs.current[i] = g; }}>
      <mesh position={[-.26, 1.2, 0]} rotation-z={.08}><boxGeometry args={[.11, .62, .11]} /><meshStandardMaterial color={p.color} /></mesh>
      <mesh position={[.26, 1.2, 0]} rotation-z={-.08}><boxGeometry args={[.11, .62, .11]} /><meshStandardMaterial color={p.color} /></mesh>
    </group>
    <mesh position-y={2.05}><sphereGeometry args={[.23, 12, 12]} /><meshStandardMaterial color="#704a33" /></mesh>
  </group>)}</>;
}

function ExpandedNPCs() {
  const agents = React.useMemo(() => Array.from({ length: 42 }, (_, i) => {
    const axis = i % 2 === 0 ? 'x' : 'z';
    const lane = [-116, -76, -36, 4, 44, 84, 124][i % 7] + (i % 4 < 2 ? 2.8 : -2.8);
    const pos = -148 + (i * 19) % 292;
    return { axis, lane, pos, dir: i % 3 === 0 ? -1 : 1, speed: .65 + (i % 5) * .13, color: ['#577b91', '#9b5a4b', '#6b7b51', '#735a82', '#9d744c', '#667d92'][i % 6] };
  }), []);
  const refs = React.useRef<THREE.Group[]>([]);
  const legRefs = React.useRef<THREE.Group[]>([]);
  const armRefs = React.useRef<THREE.Group[]>([]);
  const torsoRefs = React.useRef<THREE.Group[]>([]);
  const combatRefs = React.useRef<(CombatTarget | null)[]>([]);
  React.useEffect(() => {
    const targets = combatRefs.current.filter(Boolean) as CombatTarget[];
    targets.forEach((t) => { if (!combatTargets.includes(t)) combatTargets.push(t); });
    return () => { targets.forEach((t) => { const i = combatTargets.indexOf(t); if (i >= 0) combatTargets.splice(i, 1); }); };
  }, []);
  useFrame((state, dt) => refs.current.forEach((g, i) => {
    if (!g) return;
    const target = combatRefs.current[i];
    if (target && !target.alive) {
      const elapsed = target.deathStartedAt ? (performance.now() - target.deathStartedAt) / 1000 : 0;
      const t = THREE.MathUtils.clamp(elapsed / 0.92, 0, 1);
      const ease = t * t * (3 - 2 * t);
      const impact = THREE.MathUtils.clamp(elapsed / 0.13, 0, 1);
      const impactEase = 1 - Math.pow(1 - impact, 3);
      g.rotation.z = target.fallSign * ease * 1.48;
      g.rotation.x = -impactEase * 0.22 - ease * 0.18;
      g.position.y = 0.2 - ease * 0.1 + Math.sin(impact * Math.PI) * 0.07;
      g.position.z += target.fallSign * dt * (0.18 + ease * 0.26);
      if (t >= 1) g.visible = false;
      return;
    }
    const p = agents[i];
    if (p.axis === 'x') {
      g.position.x += p.dir * p.speed * dt;
      if (g.position.x > 150) g.position.x = -150;
      if (g.position.x < -150) g.position.x = 150;
      g.rotation.y = p.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      g.position.z += p.dir * p.speed * dt;
      if (g.position.z > 150) g.position.z = -150;
      if (g.position.z < -150) g.position.z = 150;
      g.rotation.y = p.dir > 0 ? 0 : Math.PI;
    }
    const walk = Math.sin(state.clock.elapsedTime * (4.2 + p.speed * 2.1) + i * .67) * .35;
    legRefs.current[i]?.rotation.set(walk, 0, 0);
    const arm = armRefs.current[i];
    if (arm) arm.rotation.x = -walk * .7;
    const torso = torsoRefs.current[i];
    if (torso) {
      torso.rotation.z = Math.sin(state.clock.elapsedTime * 2.1 + i * .47) * .035;
      torso.rotation.x = Math.cos(state.clock.elapsedTime * 1.7 + i * .21) * .018;
    }
  }));
  return <>{agents.map((p, i) => {
    const position: [number, number, number] = p.axis === 'x' ? [p.pos, .2, p.lane] : [p.lane, .2, p.pos];
    return <group key={`outer-npc-${i}`} ref={(g) => { if (g) { refs.current[i] = g; if (!combatRefs.current[i]) combatRefs.current[i] = { group: g, health: 100, alive: true, deathStartedAt: 0, fallSign: 1 }; } }} position={position}>
      <group ref={(g) => { if (g) legRefs.current[i] = g; }}><mesh position={[-.11, .52, 0]} castShadow><boxGeometry args={[.13, .7, .13]} /><meshStandardMaterial color="#28333a" /></mesh><mesh position={[.11, .52, 0]} castShadow><boxGeometry args={[.13, .7, .13]} /><meshStandardMaterial color="#28333a" /></mesh></group>
      <group ref={(g) => { if (g) torsoRefs.current[i] = g; }}><mesh position-y={1.18} castShadow><capsuleGeometry args={[.2, .78, 4, 8] as any} /><meshStandardMaterial color={p.color} /></mesh></group>
      <group ref={(g) => { if (g) armRefs.current[i] = g; }}><mesh position={[-.26, 1.2, 0]}><boxGeometry args={[.11, .62, .11]} /><meshStandardMaterial color={p.color} /></mesh><mesh position={[.26, 1.2, 0]}><boxGeometry args={[.11, .62, .11]} /><meshStandardMaterial color={p.color} /></mesh></group>
      <mesh position-y={2.05}><sphereGeometry args={[.23, 12, 12]} /><meshStandardMaterial color="#704a33" /></mesh>
    </group>;
  })}</>;
}

function TrafficLight({ x, z, rotation = 0 }: { x: number; z: number; rotation?: number }) {
  const green = React.useRef<THREE.Mesh>(null);
  const yellow = React.useRef<THREE.Mesh>(null);
  const red = React.useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    const phase = ((clock.elapsedTime + x * 0.01 + z * 0.007) % 16 + 16) % 16;
    const setGlow = (mesh: THREE.Mesh | null, active: boolean) => {
      if (!mesh) return;
      (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = active ? 2.6 : 0.16;
    };
    setGlow(green.current, phase < 8.5);
    setGlow(yellow.current, phase >= 8.5 && phase < 11);
    setGlow(red.current, phase >= 11);
  });
  return <group position={[x, 0, z]} rotation-y={rotation}><mesh position-y={2.2}><cylinderGeometry args={[.09, .11, 4.4, 8]} /><meshStandardMaterial color="#20262a" /></mesh><mesh position={[0, 4.55, 0]}><boxGeometry args={[.45, 1.65, .35]} /><meshStandardMaterial color="#1b2023" /></mesh><mesh ref={green} position={[0, 5.0, .2]}><sphereGeometry args={[.11, 10, 10]} /><meshStandardMaterial color="#68ff88" emissive="#2e9e4a" emissiveIntensity={.16} /></mesh><mesh ref={yellow} position={[0, 4.55, .2]}><sphereGeometry args={[.11, 10, 10]} /><meshStandardMaterial color="#f6be63" emissive="#7b4e18" emissiveIntensity={.16} /></mesh><mesh ref={red} position={[0, 4.1, .2]}><sphereGeometry args={[.11, 10, 10]} /><meshStandardMaterial color="#d4473c" emissive="#8b1f1a" emissiveIntensity={.16} /></mesh></group>;
}

function RoadSign({ x, z, rotation = 0, text }: { x: number; z: number; rotation?: number; text: string }) {
  return <group position={[x, 0, z]} rotation-y={rotation}><mesh position-y={1.55}><cylinderGeometry args={[.06, .08, 3.1, 8]} /><meshStandardMaterial color="#24292c" /></mesh><mesh position-y={2.8}><boxGeometry args={[2.4, .75, .08]} /><meshStandardMaterial color="#1b2c35" /></mesh><mesh position={[0, 2.82, .06]}><boxGeometry args={[1.9, .4, .03]} /><meshStandardMaterial color="#d6bb70" emissive="#7f6a32" emissiveIntensity={.35} /></mesh></group>;
}

function StreetProps() {
  return <>
    {Array.from({ length: 8 }, (_, i) => <StreetLight key={`a${i}`} x={-11.6} z={-66 + i * 18} double={i % 3 === 0} />)}
    {Array.from({ length: 8 }, (_, i) => <StreetLight key={`b${i}`} x={11.6} z={-66 + i * 18} flip double={i % 3 === 0} />)}
    {Array.from({ length: 6 }, (_, i) => <Palm key={`p${i}`} x={-15.1} z={-58 + i * 22} s={.84} lean={i % 2 ? -.035 : .035} />)}
    {Array.from({ length: 6 }, (_, i) => <Palm key={`q${i}`} x={15.1} z={-50 + i * 22} s={.8} lean={i % 2 ? .035 : -.035} />)}
    <TreePlanter x={-8.7} z={-17.2} /><TreePlanter x={8.7} z={17.2} />
    <Bench x={-10.2} z={-18} rotation={Math.PI / 2} /><Bench x={10.2} z={18} rotation={-Math.PI / 2} />
    <Bin x={-11.0} z={-18.4} /><Bin x={11.0} z={18.4} />
    <TrafficLight x={-11.1} z={-12.5} /><TrafficLight x={11.1} z={12.5} rotation={Math.PI} />
    <RoadSign x={-8.9} z={-15.3} rotation={Math.PI} text="DOWNTOWN" /><RoadSign x={8.9} z={15.3} text="HARBOR" />
  </>;
}

function CityDistrictSign({ x, z, label, accent }: { x: number; z: number; label: string; accent: string }) {
  return <group position={[x, 0, z]}>
    <mesh position-y={2.35} castShadow><boxGeometry args={[7.2, 4.2, .34]} /><meshStandardMaterial color="#131b20" roughness={.42} metalness={.18} /></mesh>
    <mesh position={[0, 2.35, .19]}><boxGeometry args={[6.5, 1.5, .05]} /><meshStandardMaterial color={accent} emissive={accent} emissiveIntensity={1.15} /></mesh>
    <mesh position-y={.95}><boxGeometry args={[.12, 1.9, .12]} /><meshStandardMaterial color="#30383c" metalness={.72} roughness={.3} /></mesh>
    <mesh position={[0, 3.42, .23]}><boxGeometry args={[4.9, .12, .03]} /><meshStandardMaterial color="#f8e2aa" emissive="#b98b39" emissiveIntensity={.5} /></mesh>
  </group>;
}

function ExpandedCity() {
  const lots = React.useMemo(() => OUTER_BUILDING_LOTS.map(([x, z, w, d], i) => {
    const tall = i % 5 === 0;
    const h = tall ? 30 + (i % 3) * 7 : 12 + (i % 5) * 4;
    const accents = ['#d7a257', '#84aab7', '#cb7c66', '#a78bcb', '#8fae88', '#b9a26e'];
    const accent = accents[i % accents.length];
    const warm = i % 2 === 0;
    const label = i % 4 === 0 ? ['NORTH TOWER', 'RIVER VIEW', 'METRO HOUSE', 'URBAN LOFT'][i % 4] : undefined;
    return { x, z, w, d, h, accent, label, dark: !warm && tall, glass: tall && i % 2 === 0 };
  }), []);

  return <>
    {lots.map((b, i) => <Building key={`outer-building-${i}`} {...b} />)}
    <Building x={-104} z={22} w={22} d={16} h={11} accent="#d08f4a" label="INDUSTRIAL DEPOT" />
    <Building x={104} z={-22} w={22} d={16} h={11} accent="#b889d3" label="NIGHT MARKET" />
    <Building x={-24} z={-104} w={18} d={18} h={15} accent="#8caf9a" label="COMMUNITY CENTER" />
    <Building x={24} z={104} w={18} d={18} h={18} accent="#c6a66b" label="CITY HALL" />
    <group position={[0, 0, 0]}>
      <mesh position={[-100, .12, 100]} receiveShadow><boxGeometry args={[30, .2, 24]} /><meshStandardMaterial color="#5c665b" roughness={.9} /></mesh>
      {[-9, 0, 9].map((px) => <TreePlanter key={px} x={px - 100} z={100} />)}
      <Bench x={-100} z={94} />
      <Bench x={-100} z={106} />
      <CityDistrictSign x={-100} z={108} label="RESIDENTIAL" accent="#7fae8f" />
    </group>
    <group position={[0, 0, 0]}>
      <mesh position={[100, .12, 100]} receiveShadow><boxGeometry args={[28, .2, 26]} /><meshStandardMaterial color="#3e4145" roughness={.92} /></mesh>
      <mesh position={[93, 1.2, 100]}><cylinderGeometry args={[1.1, 1.1, 2.4, 16]} /><meshStandardMaterial color="#27353c" metalness={.7} roughness={.25} /></mesh>
      <mesh position={[107, 1.2, 100]}><cylinderGeometry args={[1.1, 1.1, 2.4, 16]} /><meshStandardMaterial color="#27353c" metalness={.7} roughness={.25} /></mesh>
      <CityDistrictSign x={100} z={114} label="ENTERTAINMENT" accent="#b68adb" />
    </group>
    <group position={[0, 0, 0]}>
      <mesh position={[-100, .12, -100]} receiveShadow><boxGeometry args={[28, .2, 24]} /><meshStandardMaterial color="#4c4a45" roughness={.95} /></mesh>
      {[[-8, -7], [0, 6], [8, -6]].map(([x, z], i) => <mesh key={i} position={[x - 100, 1.1, z - 100]}><boxGeometry args={[5.8, 2.1, 3.2]} /><meshStandardMaterial color={i === 1 ? '#566a6e' : '#6d4d3e'} roughness={.72} /></mesh>)}
      <CityDistrictSign x={-100} z={-113} label="INDUSTRIAL" accent="#d48b55" />
    </group>
    <group position={[0, 0, 0]}>
      <mesh position={[100, .12, -100]} receiveShadow><boxGeometry args={[30, .2, 26]} /><meshStandardMaterial color="#68747a" roughness={.78} /></mesh>
      {[[-9, -6], [-1, 6], [7, -7], [10, 7]].map(([x, z], i) => <group key={i} position={[x + 100, .2, z - 100]}><mesh castShadow><boxGeometry args={[3.2, 2.6, 2.2]} /><meshStandardMaterial color={i % 2 ? '#b56c49' : '#4d7180'} /></mesh></group>)}
      <CityDistrictSign x={100} z={-113} label="HARBOR" accent="#6ca0b8" />
    </group>
    <CityDistrictSign x={0} z={136} label="NORTH DOWNTOWN" accent="#d5b36a" />
    <CityDistrictSign x={136} z={0} label="EAST DISTRICT" accent="#d08fc5" />
    <CityDistrictSign x={-136} z={0} label="WEST DISTRICT" accent="#c88964" />
  </>;
}

function ExpandedStreetProps() {
  const major = [-120, -80, 80, 120];
  return <>
    {major.flatMap((x) => Array.from({ length: 7 }, (_, i) => <StreetLight key={`v-light-${x}-${i}`} x={x - 6.8} z={-120 + i * 40} flip={i % 2 === 1} double={i % 3 === 0} />))}
    {major.flatMap((z) => Array.from({ length: 7 }, (_, i) => <StreetLight key={`h-light-${z}-${i}`} x={-120 + i * 40} z={z - 6.8} flip={i % 2 === 0} double={i % 3 === 0} />))}
    {[-100, -60, 60, 100].flatMap((x, i) => <React.Fragment key={`palm-set-${x}`}><Palm x={x - 9} z={-118 + i * 26} s={.76} /><Palm x={x + 9} z={110 - i * 26} s={.76} lean={i % 2 ? -.04 : .04} /></React.Fragment>)}
  </>;
}

function ExpandedTraffic() {
  const lanes = React.useMemo(() => {
    const list: { axis: 'x' | 'z'; lane: number; pos: number; speed: number; color: string; reverse: boolean }[] = [];
    const colors = ['#315f7a', '#c9b36e', '#8b3038', '#727e85', '#3d6048', '#d07e3d', '#5866a0', '#a1a6ad'];
    [-120, -80, 80, 120].forEach((road, r) => {
      [-4.2, 4.2].forEach((lane, l) => {
        list.push({ axis: 'x', lane: road, pos: -145 + r * 31, speed: 7 + ((r + l) % 3) * 1.1, color: colors[(r * 2 + l) % colors.length], reverse: l === 0 });
        list.push({ axis: 'z', lane: road, pos: -145 + r * 37, speed: 6.2 + ((r + l) % 4), color: colors[(r * 2 + l + 2) % colors.length], reverse: l === 0 });
      });
    });
    return list;
  }, []);
  const refs = React.useRef<THREE.Group[]>([]);
  useFrame((_, dt) => refs.current.forEach((g, i) => {
    if (!g) return;
    const lane = lanes[i];
    const dir = lane.reverse ? -1 : 1;
    if (lane.axis === 'x') {
      g.position.x += dir * lane.speed * dt;
      if (g.position.x > 152) g.position.x = -152;
      if (g.position.x < -152) g.position.x = 152;
      g.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      g.position.z += dir * lane.speed * dt;
      if (g.position.z > 152) g.position.z = -152;
      if (g.position.z < -152) g.position.z = 152;
      g.rotation.y = dir > 0 ? 0 : Math.PI;
    }
  }));
  return <>{lanes.map((lane, i) => <group key={i} ref={(g) => { if (g) refs.current[i] = g; }} position={lane.axis === 'x' ? [lane.pos, .12, lane.lane + (lane.reverse ? -4.2 : 4.2)] : [lane.lane + (lane.reverse ? -4.2 : 4.2), .12, lane.pos]}><Car color={lane.color} compact={i % 2 === 0} /></group>)}</>;
}

function Roads() {
  const roads = [-120, -80, -40, 0, 40, 80, 120];
  const citySize = 300;
  return <group>
    <mesh position-y={-.1} receiveShadow><boxGeometry args={[citySize, .16, citySize]} /><meshStandardMaterial color="#77766f" roughness={.995} /></mesh>
    {roads.map((x) => <mesh key={`vr-${x}`} position={[x, .02, 0]} receiveShadow><boxGeometry args={[13.5, .12, citySize]} /><meshStandardMaterial color="#303539" roughness={.94} /></mesh>)}
    {roads.map((z) => <mesh key={`hr-${z}`} position={[0, .025, z]} receiveShadow><boxGeometry args={[citySize, .12, 13.5]} /><meshStandardMaterial color="#303539" roughness={.94} /></mesh>)}
    {roads.flatMap((x) => <React.Fragment key={`curb-v-${x}`}><mesh position={[x - 7.15, .19, 0]} receiveShadow><boxGeometry args={[.6, .34, citySize]} /><meshStandardMaterial color="#8f8d86" roughness={.96} /></mesh><mesh position={[x + 7.15, .19, 0]} receiveShadow><boxGeometry args={[.6, .34, citySize]} /><meshStandardMaterial color="#8f8d86" roughness={.96} /></mesh></React.Fragment>)}
    {roads.flatMap((z) => <React.Fragment key={`curb-h-${z}`}><mesh position={[0, .2, z - 7.15]} receiveShadow><boxGeometry args={[citySize, .34, .6]} /><meshStandardMaterial color="#8f8d86" roughness={.96} /></mesh><mesh position={[0, .2, z + 7.15]} receiveShadow><boxGeometry args={[citySize, .34, .6]} /><meshStandardMaterial color="#8f8d86" roughness={.96} /></mesh></React.Fragment>)}
    {roads.map((x) => <React.Fragment key={`dash-v-${x}`}>{Array.from({ length: 15 }, (_, i) => <mesh key={i} position={[x, .095, -140 + i * 20]}><boxGeometry args={[.13, .025, 7]} /><meshStandardMaterial color="#e8d88b" roughness={.72} /></mesh>)}</React.Fragment>)}
    {roads.map((z) => <React.Fragment key={`dash-h-${z}`}>{Array.from({ length: 15 }, (_, i) => <mesh key={i} position={[-140 + i * 20, .095, z]}><boxGeometry args={[7, .025, .13]} /><meshStandardMaterial color="#e8d88b" roughness={.72} /></mesh>)}</React.Fragment>)}
    {[-120, -80, 0, 80, 120].flatMap((x) => <React.Fragment key={`cross-v-${x}`}>{Array.from({ length: 6 }, (_, i) => <mesh key={i} position={[x - 4.6 + i * 1.85, .12, -7.0]}><boxGeometry args={[1.2, .025, 4.4]} /><meshStandardMaterial color="#e4e0d4" /></mesh>)}{Array.from({ length: 6 }, (_, i) => <mesh key={`b${i}`} position={[x - 4.6 + i * 1.85, .12, 7.0]}><boxGeometry args={[1.2, .025, 4.4]} /><meshStandardMaterial color="#e4e0d4" /></mesh>)}</React.Fragment>)}
    {[-120, -80, 0, 80, 120].flatMap((z) => <React.Fragment key={`cross-h-${z}`}>{Array.from({ length: 6 }, (_, i) => <mesh key={i} position={[-7.0, .12, z - 4.6 + i * 1.85]}><boxGeometry args={[4.4, .025, 1.2]} /><meshStandardMaterial color="#e4e0d4" /></mesh>)}{Array.from({ length: 6 }, (_, i) => <mesh key={`r${i}`} position={[7.0, .12, z - 4.6 + i * 1.85]}><boxGeometry args={[4.4, .025, 1.2]} /><meshStandardMaterial color="#e4e0d4" /></mesh>)}</React.Fragment>)}
  </group>;
}


function Dealership() {
  return <group position={[48, 0, 8]}>
    <mesh position-y={2.4} castShadow><boxGeometry args={[12, 4.8, 7]} /><meshStandardMaterial color="#27343a" roughness={.28} metalness={.18} /></mesh>
    <mesh position={[0, 4.95, -3.5]}><boxGeometry args={[10.5, .7, .12]} /><meshStandardMaterial color="#f4c969" emissive="#d39f3c" emissiveIntensity={1.35} /></mesh>
    <mesh position={[0, 3.05, -3.56]}><boxGeometry args={[9.5, 1.65, .05]} /><meshStandardMaterial color="#8db9c4" roughness={.16} metalness={.24} emissive="#355762" emissiveIntensity={.22} /></mesh>
    <mesh position={[0, 1.0, -3.7]}><boxGeometry args={[2.3, 2.0, .08]} /><meshStandardMaterial color="#0e1418" /></mesh>
    <group position={[0, 5.45, -3.65]}><mesh><boxGeometry args={[6.5, .62, .1]} /><meshStandardMaterial color="#f4c969" emissive="#9a6a1d" emissiveIntensity={1.25} /></mesh></group>
    <group position={[0, .12, 2.1]}><Car color="#2f5f7a" compact /><group position={[4.2,0,0]}><Car color="#b64141" compact /></group></group>
  </group>;
}

function GasStation() {
  return <group position={[-47, 0, -3]}>
    <mesh position-y={2.8} castShadow><boxGeometry args={[10, 5.6, 8]} /><meshStandardMaterial color="#343d42" roughness={.5} /></mesh>
    <mesh position={[-2.6, 4.9, -4.0]}><boxGeometry args={[4.4, .75, .1]} /><meshStandardMaterial color="#d56c55" emissive="#7e3024" emissiveIntensity={1.1} /></mesh>
    {[-2.7, 0, 2.7].map((x) => <group key={x} position={[x, .75, 1.3]}><mesh><boxGeometry args={[1.0, 1.5, .8]} /><meshStandardMaterial color="#d7d4cb" roughness={.55} /></mesh><mesh position={[0, .12, .44]}><boxGeometry args={[.62, .5, .06]} /><meshStandardMaterial color="#11171b" /></mesh></group>)}
    <mesh position={[-3.8, 4.2, 1.0]}><boxGeometry args={[1.25, 8.0, .35]} /><meshStandardMaterial color="#1f2529" /></mesh>
    <mesh position={[-3.8, 8.35, 1.0]}><boxGeometry args={[2.4, 1.15, .42]} /><meshStandardMaterial color="#f2c76c" emissive="#bc8a2a" emissiveIntensity={1.1} /></mesh>
  </group>;
}

function HarborBackdrop() {
  return <group position={[-36, 0, -64]}>
    {[-10, -4, 2, 8].map((x, i) => <mesh key={i} position={[x, 2.5 + (i % 2) * .4, 0]} castShadow><boxGeometry args={[4.8, 5 + (i % 2) * .8, 3.6]} /><meshStandardMaterial color={i % 2 ? '#7f3f36' : '#3b6371'} roughness={.75} /></mesh>)}
    <mesh position={[3, 5.8, -1.4]} rotation-z={-.06} castShadow><cylinderGeometry args={[.08, .08, 10, 12]} /><meshStandardMaterial color="#273136" metalness={.7} /></mesh>
    <mesh position={[2.2, 10.3, -1.4]} rotation-z={-.42}><boxGeometry args={[.16, 2.4, .16]} /><meshStandardMaterial color="#273136" metalness={.7} /></mesh>
  </group>;
}

function RouteChevrons() {
  const points = React.useMemo(() => [
    [29, .11, 10], [18, .11, 8], [8, .11, 2], [-2, .11, -10], [-8, .11, -22], [-9, .11, -34], [-9, .11, -46]
  ] as [number, number, number][], []);
  const mission = useGame((s) => s.mission);
  if (mission !== 'deliver') return null;
  return <>{points.map(([x,y,z],i) => <mesh key={i} position={[x,y,z]} rotation-y={(i % 2 ? .2 : -.2)}>
    <shapeGeometry args={[(() => { const sh = new THREE.Shape(); sh.moveTo(-.6, .45); sh.lineTo(.6, .45); sh.lineTo(.0, -.55); sh.closePath(); return sh; })()]} />
    <meshStandardMaterial color="#f4c969" emissive="#b47d25" emissiveIntensity={1.2} transparent opacity={.72} side={THREE.DoubleSide} />
  </mesh>)}</>;
}

function EmploymentCenter() {
  return <group position={[43, 0, 24]}>
    <mesh position-y={3} castShadow><boxGeometry args={[22, 6, 4.6]} /><meshStandardMaterial color="#515a5e" roughness={.43} metalness={.1} /></mesh>
    <mesh position={[0, 2.9, -2.35]}><boxGeometry args={[21.5, 4.7, .15]} /><meshStandardMaterial color="#21282c" /></mesh>
    {[-7, -3.5, 0, 3.5, 7].map((x) => <mesh key={x} position={[x, 2.9, -2.46]}><boxGeometry args={[2.3, 3.6, .04]} /><meshStandardMaterial color="#9bc0c8" metalness={.12} roughness={.16} emissive="#355861" emissiveIntensity={.18} /></mesh>)}
    <mesh position={[0, 6.4, -2.5]}><boxGeometry args={[15.5, 1.25, .15]} /><meshStandardMaterial color="#f3cd73" emissive="#d9a84e" emissiveIntensity={1.55} /></mesh>
    <mesh position={[0, 1.2, -2.55]}><boxGeometry args={[4.2, 2.3, .2]} /><meshStandardMaterial color="#172025" roughness={.22} /></mesh>
    <mesh position={[0, .95, -3.1]}><boxGeometry args={[6.5, .18, 2.1]} /><meshStandardMaterial color="#303a3e" /></mesh>
    <mesh position={[0, .18, -2.55]} rotation-x={-Math.PI / 2}><circleGeometry args={[3.0, 48]} /><meshStandardMaterial color="#162229" roughness={.88} /></mesh>
    <LandmarkMarker />
  </group>;
}

function LandmarkMarker() {
  return <group position={[0, 0, -4]}><mesh position-y={.04} rotation-x={-Math.PI / 2}><ringGeometry args={[2.2, 2.55, 48]} /><meshStandardMaterial color="#f5cc70" emissive="#e2aa45" emissiveIntensity={1.4} transparent opacity={.9} /></mesh><mesh position-y={2.5}><cylinderGeometry args={[.12, .12, 4.7, 12]} /><meshStandardMaterial color="#f5cc70" emissive="#e2aa45" emissiveIntensity={1} transparent opacity={.72} /></mesh></group>;
}

function DeliveryMarker() {
  return <group position={[DELIVERY.x, 0, DELIVERY.z]}><mesh position-y={.04} rotation-x={-Math.PI / 2}><ringGeometry args={[2.0, 2.35, 48]} /><meshStandardMaterial color="#7bc9ff" emissive="#4da7e6" emissiveIntensity={1.35} transparent opacity={.86} /></mesh><mesh position-y={2.2}><cylinderGeometry args={[.1, .1, 4.2, 12]} /><meshStandardMaterial color="#7bc9ff" emissive="#4da7e6" emissiveIntensity={1} transparent opacity={.68} /></mesh></group>;
}

function VehicleEntryGlow() {
  const inVehicle = useGame((s) => s.inVehicle);
  const mission = useGame((s) => s.mission);
  const px = useGame((s) => s.playerX);
  const pz = useGame((s) => s.playerZ);
  const x = useGame((s) => s.vehicleX);
  const z = useGame((s) => s.vehicleZ);
  if (mission !== 'deliver' || inVehicle) return null;
  const distance = Math.hypot(px - x, pz - z);
  if (distance > 10) return null;
  return <group position={[x, .03, z]}>
    <mesh rotation-x={-Math.PI / 2}>
      <ringGeometry args={[1.8, 2.05, 48]} />
      <meshStandardMaterial color="#8fe6b1" emissive="#62c791" emissiveIntensity={1.1} transparent opacity={.6} />
    </mesh>
    <mesh position-y={2.15}>
      <octahedronGeometry args={[.22, 0]} />
      <meshStandardMaterial color="#8fe6b1" emissive="#62c791" emissiveIntensity={1.4} />
    </mesh>
  </group>;
}

function VehicleMarker() {
  const mission = useGame((s) => s.mission);
  const inVehicle = useGame((s) => s.inVehicle);
  const x = useGame((s) => s.vehicleX);
  const z = useGame((s) => s.vehicleZ);
  if (mission !== 'deliver' || inVehicle) return null;
  return <group position={[x, 0, z]}><mesh position-y={.04} rotation-x={-Math.PI / 2}><ringGeometry args={[2.0, 2.35, 48]} /><meshStandardMaterial color="#f4c969" emissive="#d9a64b" emissiveIntensity={1.25} transparent opacity={.9} /></mesh><mesh position-y={2.0}><cylinderGeometry args={[.08, .08, 3.8, 12]} /><meshStandardMaterial color="#f4c969" emissive="#d9a64b" emissiveIntensity={.9} transparent opacity={.7} /></mesh></group>;
}

function WeaponShop() {
  return <group position={[WEAPON_SHOP.x, 0, WEAPON_SHOP.z]}>
    <mesh position-y={2.3} castShadow><boxGeometry args={[11, 4.6, 6.5]} /><meshStandardMaterial color="#171d22" roughness={.42} metalness={.16} /></mesh>
    <mesh position={[0, 4.75, -3.3]}><boxGeometry args={[10.4, .55, .12]} /><meshStandardMaterial color="#f06b58" emissive="#a63b2d" emissiveIntensity={1.25} /></mesh>
    <mesh position={[0, 3.15, -3.37]}><boxGeometry args={[8.8, 1.35, .06]} /><meshStandardMaterial color="#8eb6c0" roughness={.16} metalness={.24} emissive="#31555f" emissiveIntensity={.2} /></mesh>
    <mesh position={[0, 1.0, -3.5]}><boxGeometry args={[2.1, 1.9, .08]} /><meshStandardMaterial color="#0b1014" /></mesh>
    <mesh position={[0, 5.3, -3.45]}><boxGeometry args={[6.3, .62, .1]} /><meshStandardMaterial color="#f06b58" emissive="#8f3025" emissiveIntensity={1.3} /></mesh>
    <mesh position-y={.16} rotation-x={-Math.PI/2}><ringGeometry args={[5.1, 5.45, 48]} /><meshStandardMaterial color="#ef6c5b" emissive="#a33a2e" emissiveIntensity={1.1} transparent opacity={.34} /></mesh>
  </group>;
}

function WeaponMarker() {
  const owned = useGame((s) => s.weaponOwned);
  if (owned) return null;
  return <group position={[WEAPON_SHOP.x, 0, WEAPON_SHOP.z]}>
    <mesh position-y={.05} rotation-x={-Math.PI/2}><ringGeometry args={[3.5, 4.0, 48]} /><meshStandardMaterial color="#ef6c5b" emissive="#b44335" emissiveIntensity={1.5} transparent opacity={.85} /></mesh>
    <mesh position-y={2.8}><coneGeometry args={[.5, 1.1, 4]} /><meshStandardMaterial color="#ef6c5b" emissive="#9a3026" emissiveIntensity={1.35} /></mesh>
  </group>;
}

function WeaponModel() {
  const owned = useGame((s) => s.weaponOwned);
  const inVehicle = useGame((s) => s.inVehicle);
  const shotSeq = useGame((s) => s.shotSeq);
  const ref = React.useRef<THREE.Group | null>(null);
  const { camera } = useThree();
  const weapon = React.useMemo(() => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(.18, .16, .65), new THREE.MeshStandardMaterial({ color:'#343b43', metalness:.5, roughness:.28 }));
    const emitter = new THREE.Mesh(new THREE.CylinderGeometry(.075, .09, .22, 12), new THREE.MeshStandardMaterial({ color:'#7de8ff', emissive:'#2ab4d8', emissiveIntensity:2.4 }));
    emitter.rotation.x = Math.PI/2;
    emitter.position.z = -.4;
    const grip = new THREE.Mesh(new THREE.BoxGeometry(.13, .28, .16), new THREE.MeshStandardMaterial({ color:'#1b232a', roughness:.5 }));
    grip.position.set(0,-.18,.12); grip.rotation.x = -.25;
    const accent = new THREE.Mesh(new THREE.BoxGeometry(.08,.06,.42), new THREE.MeshStandardMaterial({ color:'#f06c5b', emissive:'#6e251e', emissiveIntensity:1.1 }));
    accent.position.set(0,.1,-.02);
    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(.12, 10, 10), new THREE.MeshStandardMaterial({ color:'#dffbff', emissive:'#5fe5ff', emissiveIntensity:4.5, transparent:true, opacity:.92 }));
    muzzle.position.set(0, .02, -.53);
    muzzle.scale.set(.55, .55, 1.1);
    muzzle.visible = false;
    g.add(body, emitter, grip, accent, muzzle);
    return g;
  }, []);
  const recoil = React.useRef(0);
  const muzzle = React.useRef<THREE.Mesh | null>(null);
  const lastShotSeen = React.useRef(shotSeq);
  React.useEffect(() => { camera.add(weapon); return () => { camera.remove(weapon); }; }, [camera, weapon]);
  React.useEffect(() => { ref.current = weapon; muzzle.current = weapon.children[4] as THREE.Mesh; }, [weapon]);
  React.useEffect(() => {
    if (shotSeq === lastShotSeen.current) return;
    lastShotSeen.current = shotSeq;
    recoil.current = 1;
  }, [shotSeq]);
  useFrame((_, dt) => {
    weapon.visible = owned && !inVehicle;
    recoil.current = THREE.MathUtils.damp(recoil.current, 0, 15, dt);
    weapon.position.lerp(new THREE.Vector3(.34, -.3 + recoil.current * .025, -.68 + recoil.current * .085), 1 - Math.exp(-18 * dt));
    weapon.rotation.x = THREE.MathUtils.damp(weapon.rotation.x, .06 - recoil.current * .16, 18, dt);
    weapon.rotation.y = THREE.MathUtils.damp(weapon.rotation.y, -.2, 14, dt);
    weapon.rotation.z = THREE.MathUtils.damp(weapon.rotation.z, recoil.current * .06, 18, dt);
    if (muzzle.current) muzzle.current.visible = performance.now() - lastShotVisualAt < 85;
  });
  return null;
}

function WingedAvatar() {
  const flying = useGame((s) => s.flying);
  const x = useGame((s) => s.playerX);
  const y = useGame((s) => s.playerY);
  const z = useGame((s) => s.playerZ);
  const group = React.useRef<THREE.Group>(null);
  const left = React.useRef<THREE.Group>(null);
  const right = React.useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (!group.current) return;
    const t = clock.elapsedTime;
    const flap = Math.sin(t * 7.2) * 0.28 + Math.sin(t * 3.3) * 0.08;
    group.current.position.set(x, y - 1.45, z);
    group.current.rotation.y = look.yaw;
    group.current.visible = flying;
    if (left.current) left.current.rotation.z = 0.16 + flap;
    if (right.current) right.current.rotation.z = -0.16 - flap;
  });
  const feathers = (side: number) => Array.from({ length: 7 }, (_, i) => {
    const p = i / 6;
    return <mesh key={i} position={[side * (0.75 + p * 2.25), 0.15 + Math.sin(p * Math.PI) * 0.55, 0]} rotation-z={side * (-0.22 + p * 0.38)}>
      <coneGeometry args={[0.24 + p * 0.08, 1.65 - p * 0.15, 6]} />
      <meshStandardMaterial color={i % 2 ? '#d9e7ff' : '#a9c8ff'} emissive="#5577aa" emissiveIntensity={0.12} roughness={0.48} />
    </mesh>;
  });
  return <group ref={group}>
    <mesh position={[0, 1.1, 0]} castShadow><capsuleGeometry args={[0.3, 0.85, 4, 8] as any} /><meshStandardMaterial color="#d6dce2" metalness={0.08} roughness={0.52} /></mesh>
    <mesh position={[0, 1.95, 0]} castShadow><sphereGeometry args={[0.28, 16, 12]} /><meshStandardMaterial color="#7a5138" roughness={0.72} /></mesh>
    <group ref={left}>{feathers(-1)}</group>
    <group ref={right}>{feathers(1)}</group>
    <pointLight position={[0, 1.2, 0]} color="#8ac7ff" intensity={flying ? 1.0 : 0} distance={4} decay={2} />
  </group>;
}

function VehicleRig() {
  const ref = React.useRef<THREE.Group>(null);
  useFrame(() => {
    if (!ref.current) return;
    ref.current.position.set(vehicleRuntime.x, 0.12, vehicleRuntime.z);
    ref.current.rotation.set(vehicleRuntime.pitch, vehicleRuntime.yaw, vehicleRuntime.roll);
  });
  return <group ref={ref}><DeliveryVan /></group>;
}

function CityAtmosphere() {
  const sun = React.useRef<THREE.DirectionalLight>(null);
  const fill = React.useRef<THREE.DirectionalLight>(null);
  useFrame(({ clock, scene }) => {
    const cycle = (clock.elapsedTime % 180) / 180;
    const daylight = (Math.sin((cycle - 0.18) * Math.PI * 2) + 1) / 2;
    const dusk = Math.max(0, 1 - Math.abs(cycle - 0.78) / 0.14);
    if (sun.current) {
      const angle = cycle * Math.PI * 2;
      sun.current.position.set(Math.cos(angle) * 125, 28 + daylight * 75, Math.sin(angle) * 110);
      sun.current.intensity = 1.1 + daylight * 1.65 + dusk * 0.35;
      sun.current.color.setHSL(0.08 - dusk * 0.03, 0.42, 0.74);
    }
    if (fill.current) fill.current.intensity = 0.65 + daylight * 0.6;
    const fog = scene.fog;
    if (fog instanceof THREE.Fog) {
      fog.color.setHSL(0.57 - dusk * 0.04, 0.17, 0.67 - (1 - daylight) * 0.08);
      fog.near = 105 + daylight * 20;
      fog.far = 300 + daylight * 70;
    }
  });
  return <><directionalLight ref={sun} position={[-55, 58, -70]} intensity={2.6} color="#ffd2a1" castShadow shadow-mapSize-width={1536} shadow-mapSize-height={1536} shadow-camera-left={-170} shadow-camera-right={170} shadow-camera-top={170} shadow-camera-bottom={-170} /><directionalLight ref={fill} position={[70, 32, 10]} intensity={1.15} color="#8fb7cf" /></>;
}

function AmbientCityMotion() {
  const dust = React.useMemo(() => Array.from({ length: 120 }, (_, i) => ({ x: ((i * 73) % 280) - 140, y: 0.8 + (i % 9) * 0.45, z: ((i * 41) % 280) - 140 })), []);
  const ref = React.useRef<THREE.Points>(null);
  const geometry = React.useMemo(() => {
    const positions = new Float32Array(dust.length * 3);
    dust.forEach((p, i) => { positions[i * 3] = p.x; positions[i * 3 + 1] = p.y; positions[i * 3 + 2] = p.z; });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return g;
  }, [dust]);
  useFrame((_, dt) => {
    if (!ref.current) return;
    ref.current.rotation.y += dt * 0.003;
    ref.current.position.y = Math.sin(performance.now() * 0.00025) * 0.08;
  });
  return <points ref={ref} geometry={geometry}><pointsMaterial size={0.045} transparent opacity={0.16} depthWrite={false} /></points>;
}

function InteriorRoomLight({ x, y, z }: { x: number; y: number; z: number }) {
  return <group position={[x, y, z]}>
    <mesh><boxGeometry args={[2.2, .12, .55]} /><meshStandardMaterial color="#e6e8dc" emissive="#ffe1a0" emissiveIntensity={1.15} /></mesh>
    <pointLight color="#ffd28a" intensity={3.6} distance={8} decay={2} />
  </group>;
}

function InteriorFurniture({ floor }: { floor: number }) {
  const y = BUILDING_FLOOR_BASE_Y + floor * BUILDING_FLOOR_H;
  if (floor === 0) return <group position-y={y}>
    <mesh position={[-3.5, .65, 2.2]}><boxGeometry args={[5.4, .18, 1.6]} /><meshStandardMaterial color="#795a43" /></mesh>
    <mesh position={[-3.5, .36, 2.2]}><boxGeometry args={[4.5, .38, 1.35]} /><meshStandardMaterial color="#303b42" /></mesh>
    <mesh position={[3.6, .7, -1.8]}><boxGeometry args={[2.4, 1.4, 1.3]} /><meshStandardMaterial color="#6d5546" /></mesh>
    <mesh position={[3.6, 1.55, -1.8]}><boxGeometry args={[1.7, .7, .18]} /><meshStandardMaterial color="#1e272b" emissive="#33444b" emissiveIntensity={.16} /></mesh>
  </group>;
  if (floor === 1) return <group position-y={y}>
    <mesh position={[3.4, .65, 2.0]}><boxGeometry args={[3.8, .18, 1.4]} /><meshStandardMaterial color="#73583e" /></mesh>
    <mesh position={[3.4, .34, 2.0]}><boxGeometry args={[3.1, .35, 1.15]} /><meshStandardMaterial color="#c28b62" /></mesh>
    <mesh position={[-3.2, 1.0, -2.5]}><boxGeometry args={[1.6, 2.0, .5]} /><meshStandardMaterial color="#4e5d63" /></mesh>
    <mesh position={[-1.7, .9, -2.5]}><cylinderGeometry args={[.6, .6, .14, 16]} /><meshStandardMaterial color="#876047" /></mesh>
  </group>;
  return <group position-y={y}>
    <mesh position={[-2.8, .7, 2.2]}><boxGeometry args={[5.0, .2, 1.8]} /><meshStandardMaterial color="#5b4650" /></mesh>
    <mesh position={[-2.8, 1.18, 2.0]}><boxGeometry args={[4.0, .9, .2]} /><meshStandardMaterial color="#d8cfbf" /></mesh>
    <mesh position={[3.2, 1.1, -1.8]}><boxGeometry args={[1.0, 2.2, .5]} /><meshStandardMaterial color="#303a40" /></mesh>
  </group>;
}

function StairFlight({ x0, x1, z0, z1, y0, y1, steps = 10 }: { x0: number; x1: number; z0: number; z1: number; y0: number; y1: number; steps?: number }) {
  return <group>
    {Array.from({ length: steps }, (_, i) => {
      const t = i / steps;
      const x = THREE.MathUtils.lerp(x0, x1, t);
      const z = THREE.MathUtils.lerp(z0, z1, t);
      const y = THREE.MathUtils.lerp(y0, y1, t);
      const rise = THREE.MathUtils.lerp(.18, .46, t);
      return <mesh key={i} position={[x, y + rise * .5, z]} castShadow receiveShadow>
        <boxGeometry args={[1.65, rise, 1.15]} />
        <meshStandardMaterial color="#6f6257" roughness={.82} />
      </mesh>;
    })}
    <mesh position={[x0, y0 + 1.45, z0]}><boxGeometry args={[.12, 2.9, .12]} /><meshStandardMaterial color="#5d6669" metalness={.48} roughness={.38} /></mesh>
    <mesh position={[x1, y1 + 1.45, z1]}><boxGeometry args={[.12, 2.9, .12]} /><meshStandardMaterial color="#5d6669" metalness={.48} roughness={.38} /></mesh>
  </group>;
}

function EnterableApartmentTower() {
  const inside = useGame((s) => s.insideBuilding);
  const doorOpen = inside;
  const floorYs = [0, 1, 2, 3].map((i) => BUILDING_FLOOR_BASE_Y + i * BUILDING_FLOOR_H);
  return <group position={[ENTERABLE_BUILDING.x, 0, ENTERABLE_BUILDING.z]}>
    {/* Exterior shell with a true doorway opening on the south facade. */}
    <mesh position={[-9.25, ENTERABLE_BUILDING.h / 2, -ENTERABLE_BUILDING.d / 2]} castShadow receiveShadow><boxGeometry args={[11.5, ENTERABLE_BUILDING.h, .65]} /><meshStandardMaterial color="#536169" roughness={.58} /></mesh>
    <mesh position={[9.25, ENTERABLE_BUILDING.h / 2, -ENTERABLE_BUILDING.d / 2]} castShadow receiveShadow><boxGeometry args={[11.5, ENTERABLE_BUILDING.h, .65]} /><meshStandardMaterial color="#536169" roughness={.58} /></mesh>
    <mesh position={[0, 10.2, -ENTERABLE_BUILDING.d / 2]} castShadow receiveShadow><boxGeometry args={[7, 15.6, .65]} /><meshStandardMaterial color="#536169" roughness={.58} /></mesh>
    <mesh position={[-ENTERABLE_BUILDING.w / 2, ENTERABLE_BUILDING.h / 2, 0]} castShadow receiveShadow><boxGeometry args={[.65, ENTERABLE_BUILDING.h, ENTERABLE_BUILDING.d]} /><meshStandardMaterial color="#4b555b" roughness={.6} /></mesh>
    <mesh position={[ENTERABLE_BUILDING.w / 2, ENTERABLE_BUILDING.h / 2, 0]} castShadow receiveShadow><boxGeometry args={[.65, ENTERABLE_BUILDING.h, ENTERABLE_BUILDING.d]} /><meshStandardMaterial color="#4b555b" roughness={.6} /></mesh>
    <mesh position={[0, ENTERABLE_BUILDING.h / 2, ENTERABLE_BUILDING.d / 2]} castShadow receiveShadow><boxGeometry args={[ENTERABLE_BUILDING.w, ENTERABLE_BUILDING.h, .65]} /><meshStandardMaterial color="#4b555b" roughness={.6} /></mesh>
    <mesh position={[0, ENTERABLE_BUILDING.h, 0]} castShadow><boxGeometry args={[ENTERABLE_BUILDING.w, .65, ENTERABLE_BUILDING.d]} /><meshStandardMaterial color="#454d52" roughness={.65} /></mesh>
    {[0, 1, 2, 3].map((floor) => {
      const fy = BUILDING_FLOOR_BASE_Y + floor * BUILDING_FLOOR_H;
      return <group key={floor}>
        <mesh position={[0, fy, 0]} receiveShadow><boxGeometry args={[ENTERABLE_BUILDING.w - 1.2, .18, ENTERABLE_BUILDING.d - 1.2]} /><meshStandardMaterial color="#3e4549" roughness={.92} /></mesh>
        <InteriorRoomLight x={-6.5} y={fy + 2.8} z={-4.0} />
        <InteriorRoomLight x={6.2} y={fy + 2.8} z={1.8} />
        <InteriorFurniture floor={floor} />
      </group>;
    })}
    <mesh position={[0, 1.05, -14.4]}><boxGeometry args={[7.5, 2.1, .18]} /><meshStandardMaterial color="#11181c" /></mesh>
    <mesh position={[0, 3.1, -14.32]}><boxGeometry args={[10.5, 1.0, .16]} /><meshStandardMaterial color="#e1b45f" emissive="#a77b28" emissiveIntensity={1.2} /></mesh>
    {/* Door panels slide apart when entered. */}
    <mesh position={[-1.2 + (doorOpen ? -1.15 : 0), 1.05, -15.12]}><boxGeometry args={[2.15, 2.1, .1]} /><meshStandardMaterial color="#9bb9c1" metalness={.18} roughness={.2} /></mesh>
    <mesh position={[1.2 + (doorOpen ? 1.15 : 0), 1.05, -15.12]}><boxGeometry args={[2.15, 2.1, .1]} /><meshStandardMaterial color="#9bb9c1" metalness={.18} roughness={.2} /></mesh>
    <mesh position={[0, 6.7, -15.15]}><boxGeometry args={[13.6, 1.1, .12]} /><meshStandardMaterial color="#f0c76c" emissive="#c28b2d" emissiveIntensity={1.2} /></mesh>
    <StairFlight x0={-10.5} x1={-3.5} z0={-10.5} z1={-3.5} y0={BUILDING_FLOOR_BASE_Y} y1={BUILDING_FLOOR_BASE_Y + BUILDING_FLOOR_H} />
    <StairFlight x0={-3.5} x1={4.5} z0={-3.5} z1={4.5} y0={BUILDING_FLOOR_BASE_Y + BUILDING_FLOOR_H} y1={BUILDING_FLOOR_BASE_Y + BUILDING_FLOOR_H * 2} />
    <StairFlight x0={4.5} x1={12.5} z0={4.5} z1={12.5} y0={BUILDING_FLOOR_BASE_Y + BUILDING_FLOOR_H * 2} y1={BUILDING_FLOOR_BASE_Y + BUILDING_FLOOR_H * 3} />
  </group>;
}

function World() {
  const mission = useGame((s) => s.mission);
  return <>
    <color attach="background" args={['#8ca9b9']} />
    <fog attach="fog" args={['#91a9b8', 115, 325]} />
    <Sky distance={450000} sunPosition={[-110, 22, -70]} turbidity={4.6} rayleigh={1.5} mieCoefficient={0.008} mieDirectionalG={0.78} />
    <hemisphereLight args={['#d8e8f1', '#6a6259', 2.0]} />
    <CityAtmosphere />
    <ambientLight intensity={0.62} />
    <AmbientCityMotion />
    <Roads />
    <ExpandedCity />
    <ExpandedStreetProps />
    <EnterableApartmentTower />
    <group position={[ENTERABLE_BUILDING.x, .05, ENTERABLE_BUILDING.z - ENTERABLE_BUILDING.d / 2 - .25]}><mesh rotation-x={-Math.PI / 2}><ringGeometry args={[2.2, 2.55, 48]} /><meshStandardMaterial color="#84e1b0" emissive="#54bd87" emissiveIntensity={1.2} transparent opacity={.8} /></mesh><mesh position-y={2.5}><octahedronGeometry args={[.2, 0]} /><meshStandardMaterial color="#9af0bc" emissive="#63c792" emissiveIntensity={1.4} /></mesh></group>
    <Building x={-43} z={43} w={30} d={30} h={48} accent="#9bbbc3" dark />
    <Building x={43} z={-43} w={30} d={30} h={38} accent="#d4ae72" glass />
    <Building x={43} z={43} w={30} d={20} h={21} accent="#e3b65f" label="ARCADIA" />
    <Building x={-63} z={2} w={14} d={24} h={62} accent="#91b7c3" dark />
    <Building x={63} z={2} w={14} d={23} h={54} accent="#c9a773" />
    <Storefront x={-28} z={-10} rotation={Math.PI} sign="CAFÉ" accent="#e5b760" />
    <Storefront x={28} z={10} sign="MARKET" accent="#8fc0a2" />
    <Storefront x={-28} z={10} rotation={Math.PI} sign="AUTO" accent="#cb7e5e" />
    <Storefront x={28} z={-10} sign="FASHION" accent="#b29ad1" />
    <Dealership />
    <GasStation />
    <HarborBackdrop />
    <RouteChevrons />
    <EmploymentCenter />
    <group position={[-15.4, 0, -53]}><mesh position-y={2.5} castShadow><boxGeometry args={[5.2, 5, 3.6]} /><meshStandardMaterial color="#4d5a60" roughness={.5} /></mesh><mesh position={[0, 4.85, -1.85]}><boxGeometry args={[4.6, .8, .12]} /><meshStandardMaterial color="#f0ca73" emissive="#d5a948" emissiveIntensity={1.25} /></mesh><mesh position={[0, 1.8, -1.88]}><boxGeometry args={[2.1, 2.2, .08]} /><meshStandardMaterial color="#90b7c2" /></mesh></group>
    <StreetProps />
    <group position={[13.7, .1, -31]}><Car color="#d0b76a" compact /></group>
    <group position={[-13.7, .1, 31]} rotation-y={Math.PI}><Car color="#8d3036" /></group>
    <Traffic /><ExpandedTraffic /><NPCs /><ExpandedNPCs />
    {mission === 'deliver' ? <DeliveryMarker /> : null}
    <VehicleMarker />
    <VehicleEntryGlow />
    <WingedAvatar />
    <WeaponShop />
    <WeaponMarker />
    <WeaponModel />
    <VehicleRig />
    <Player />
  </>;
}

function MissionOverlay() {
  const mission = useGame((s) => s.mission);
  if (mission !== 'offer') return null;
  return <div className="missionOverlay"><div className="jobCard"><div className="jobEyebrow"><Package size={15}/> FIRST JOB</div><h2>Delivery Driver</h2><p>Pick up a sealed package from the downtown office and deliver it to Harbor Hub.</p><div className="jobMeta"><span><CircleDollarSign size={16}/> $100</span><span><Sparkles size={16}/> +50 XP</span><span><Navigation size={16}/> 118m</span></div><div className="jobActions"><button onClick={() => { useGame.getState().acceptJob(); }}>ACCEPT JOB <span>ENTER</span></button><button className="ghost" onClick={() => { useGame.setState({ mission: 'visit' }); }}>CANCEL</button></div></div></div>;
}

function CinematicOverlay() {
  const cinematic = useGame((s) => s.cinematic);
  const cinematicStartedAt = useGame((s) => s.cinematicStartedAt);
  const [progress, setProgress] = React.useState(0);
  React.useEffect(() => {
    let raf = 0;
    const loop = () => {
      const elapsed = (performance.now() - cinematicStartedAt) / 1000;
      const duration = cinematic === 'arrival' ? 5.6 : cinematic === 'deliveryComplete' ? 3.6 : 1.7;
      setProgress(THREE.MathUtils.clamp(elapsed / duration, 0, 1));
      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [cinematic, cinematicStartedAt]);
  const title = cinematic === 'arrival' ? 'A CITY OF POSSIBILITIES' : cinematic === 'enterVehicle' ? 'FIRST WHEELS' : 'JOB WELL DONE';
  const subtitle = cinematic === 'arrival' ? 'Your story begins now.' : cinematic === 'enterVehicle' ? 'Take control. Build your life one job at a time.' : 'One delivery down. Your reputation is growing.';
  return <div className="cinematicOverlay"><div className="cinematicLetter cinematicLetter--top" /><div className="cinematicCopy"><span>CITY LIFE // SOLO STORY</span><h2>{title}</h2><p>{subtitle}</p><div className="cinematicProgress"><i style={{ width: `${progress * 100}%` }} /></div><button onClick={() => useGame.getState().skipCinematic()}>SKIP <span>ENTER / SPACE</span></button></div><div className="cinematicLetter cinematicLetter--bottom" /></div>;
}

function CombatPulseOverlay() {
  const shotSeq = useGame((s) => s.shotSeq);
  const hit = useGame((s) => s.hitMarker);
  const [show, setShow] = React.useState(false);
  React.useEffect(() => {
    if (!shotSeq) return;
    setShow(true);
    const id = window.setTimeout(() => setShow(false), 90);
    return () => window.clearTimeout(id);
  }, [shotSeq]);
  if (!show && !hit) return null;
  return <div className={`combatFX ${hit ? 'combatFX--hit' : ''}`}><div className="combatFX__flash" />{hit && <div className="combatFX__label">TARGET DOWN</div>}</div>;
}

function HUD() {
  const { phase, energy, moving, sprint, cash, xp, reputation, level, mission, playerX, playerY, playerZ, toast, inVehicle, vehicleX, vehicleZ, vehicleSpeed, vehicleView, vehicleCondition, fuel, lightsOn, weaponOwned, weaponAmmo, weaponReserve, kills, insideBuilding, buildingFloor, flying } = useGame((s) => s);
  const target = mission === 'deliver' || mission === 'complete' ? DELIVERY : EMPLOYMENT;
  const distance = Math.max(0, Math.round(Math.hypot((inVehicle ? vehicleX : playerX) - target.x, (inVehicle ? vehicleZ : playerZ) - target.z)));
  const vehicleDistance = Math.max(0, Math.round(Math.hypot(playerX - vehicleX, playerZ - vehicleZ)));
  const near = distance < 9;
  const nearVehicle = vehicleDistance < 8.5;
  const weaponDistance = Math.round(Math.hypot(playerX - WEAPON_SHOP.x, playerZ - WEAPON_SHOP.z));
  const nearWeaponShop = weaponDistance < 8.5;
  const buildingDoorZ = ENTERABLE_BUILDING.z - ENTERABLE_BUILDING.d / 2 - 1.7;
  const buildingDistance = Math.hypot(playerX - ENTERABLE_BUILDING.x, playerZ - (insideBuilding ? buildingDoorZ : buildingDoorZ));
  const nearBuildingDoor = !inVehicle && (insideBuilding ? buildingFloor === 0 && buildingDistance < 4.8 : buildingDistance < 6.2);
  React.useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => useGame.getState().clearToast(), 2800);
    return () => window.clearTimeout(id);
  }, [toast]);
  const missionTitle = mission === 'visit' ? 'First Step' : mission === 'offer' ? 'Employment Center' : mission === 'deliver' ? 'First Job' : 'First Job Complete';
  const missionText = mission === 'visit' ? 'Visit the employment center.' : mission === 'offer' ? 'Review and accept your first job.' : mission === 'deliver' ? (inVehicle ? 'Drive to Harbor Hub.' : 'Walk to the delivery van, then drive to Harbor Hub.') : 'Return to the city and build your career.';
  return <div className="hud">
    <div className="brand"><div>CITY LIFE <b>RISE</b></div><span>METROPOLIS // DAY 01</span></div>
    <div className="topstats"><div><small>LEVEL</small><strong>{String(level).padStart(2, '0')}</strong><span className="xpMini">{xp}/100 XP</span></div><div><small>CASH</small><strong>${cash}</strong></div><div><small>REPUTATION</small><strong>{reputation}</strong></div></div>
    <div className="objective"><div className="objIcon">{mission === 'deliver' ? <Package size={18}/> : <BriefcaseBusiness size={18} />}</div><div><small>CURRENT OBJECTIVE</small><h3>{missionTitle}</h3><p>{missionText}</p></div><div className="distance"><MapPin size={14} />{distance}m</div></div>
    <div className="hintChip">{flying ? <><Sparkles size={13}/> G FOLD WINGS • SPACE UP • CTRL DOWN • SHIFT BOOST</> : insideBuilding && nearBuildingDoor ? <><DoorOpen size={13}/> PRESS E TO EXIT BUILDING</> : insideBuilding ? <><Building2 size={13}/> FLOOR {buildingFloor + 1} &nbsp; • &nbsp; FOLLOW THE STAIRCASE</> : nearBuildingDoor ? <><DoorOpen size={13}/> PRESS E TO ENTER APARTMENT TOWER</> : nearWeaponShop && !weaponOwned ? <><Shield size={13}/> PRESS E TO CLAIM FREE PULSE PISTOL</> : weaponOwned && !inVehicle ? <><Target size={13}/> LEFT CLICK / F FIRE &nbsp; • &nbsp; R RELOAD</> : near && mission === 'visit' ? <><DoorOpen size={13}/> PRESS E TO CHECK IN</> : mission === 'deliver' && inVehicle && near ? <><Package size={13}/> PRESS E TO DELIVER</> : mission === 'deliver' && !inVehicle && nearVehicle ? <><CarFront size={13}/> PRESS E / ENTER TO GET IN THE VAN</> : inVehicle ? <><Navigation size={13}/> DRIVE TO HARBOR HUB &nbsp; • &nbsp; E EXIT &nbsp; • &nbsp; L LIGHTS</> : mission === 'complete' ? <><Sparkles size={13}/> MISSION COMPLETE</> : <><Navigation size={13} /> FOLLOW THE GOLD MARKER</>}</div>
    <Crosshair className="cross" size={24} />
    {useGame((s) => s.hitMarker) && <div className="hitMarker">✦</div>}
    <CombatPulseOverlay />
    <div className="bottomLeft"><div className="meter"><div><Heart size={14} /> HEALTH <b>100</b></div><span><i style={{ width: '100%' }} /></span></div><div className="meter"><div><Zap size={14} /> ENERGY <b>{Math.round(energy)}</b></div><span><i style={{ width: `${energy}%` }} /></span></div><div className={`mode ${inVehicle ? "modeVehicle" : ""}`}>{inVehicle ? <><CarFront size={16} /> DRIVE <b>{vehicleSpeed} km/h</b><span>{vehicleSpeed < 1 ? "P" : "D"}</span><span>FUEL {Math.round(useGame.getState().fuel)}%</span><span>V {vehicleView === "third" ? "THIRD" : "FIRST"}</span></> : flying ? <><Sparkles size={16} /> FLIGHT <b>{Math.round(playerY)}m</b><span>{sprint ? "BOOST" : "CRUISE"}</span></> : <><Footprints size={16} /> {moving ? (sprint ? "SPRINT" : "WALK") : "IDLE"}</>}</div>{inVehicle && <div className="driveAssist"><b className="steerKey steerLeft">A</b><span>LEFT</span><i className="steerWheelHint" style={{ transform: `rotate(${useGame.getState().vehicleSteer * 34}deg)` }}>◜</i><i className="steerWheelHint steerWheelHint--right" style={{ transform: `rotate(${useGame.getState().vehicleSteer * 34}deg) scaleX(-1)` }}>◝</i><b className="steerKey steerRight">D</b><span>RIGHT</span><small>STEERING INPUT / WHEEL VISUAL</small></div>}</div>
    {weaponOwned && !inVehicle && <div className="weaponHUD"><div className="weaponHUD__title"><Target size={14}/> PULSE PISTOL</div><strong>{weaponAmmo}</strong><span>/ {weaponReserve}</span><small>FREE • LMB / F FIRE • R RELOAD</small><em>{kills} KILLS</em></div>}
    {inVehicle && <div className="vehicleHUD">
      <div className="vehicleHUD__top"><div><small>SPEED</small><strong>{vehicleSpeed}</strong><span>KM/H</span></div><div><small>GEAR</small><strong>{vehicleSpeed < 1 ? 'P' : (keys.has('KeyS') && vehicleSpeed < 2 ? 'R' : 'D')}</strong></div></div>
      <div className="vehicleGauge"><div className="vehicleGauge__ring" style={{ transform: `rotate(${(-118 + Math.min(236, vehicleSpeed / 70 * 236))}deg)` }} /><span className="vehicleGauge__center">{Math.round(fuel)}%</span><small>FUEL</small></div>
      <div className="vehicleStatus"><span>CONDITION</span><b>{Math.round(vehicleCondition)}%</b><i style={{ width: `${vehicleCondition}%` }} /><span>LIGHTS {lightsOn ? 'ON' : 'OFF'} · L</span></div>
    </div>}
    <div className="map"><div className="mapTitle"><Building2 size={14} />METROPOLIS</div><div className="mapGrid">
      <span className="road r1" /><span className="road r2" />
      <span className="playerDot" style={{ left: `${THREE.MathUtils.clamp(50 + ((inVehicle ? vehicleX : playerX) / 150) * 43, 8, 92)}%`, top: `${THREE.MathUtils.clamp(50 + ((inVehicle ? vehicleZ : playerZ) / 150) * 43, 8, 92)}%` }} />
      <span className="targetDot" style={{ left: `${THREE.MathUtils.clamp(50 + (target.x / 150) * 43, 8, 92)}%`, top: `${THREE.MathUtils.clamp(50 + (target.z / 150) * 43, 8, 92)}%`, right: 'auto' }} />
    </div></div>
    {toast && <div className="toast">{toast}</div>}
    {phase === 'intro' && <div className="overlay"><div className="intro"><div className="eyebrow">YOUR STORY STARTS HERE</div><h1>CITY LIFE <b>RISE</b></h1><p>You arrive in the city with <b>$500</b> and one goal: build a life from nothing.</p><div className="introStats"><span><Store size={15} /> CITY EXPLORATION</span><span><CarFront size={15} /> DRIVING</span><span><Landmark size={15} /> BUSINESS</span></div><button onClick={() => { useGame.getState().startCinematic('arrival'); document.getElementById('game-root')?.requestPointerLock(); }}>ENTER DOWNTOWN</button><span className="controls">WASD MOVE &nbsp; • &nbsp; MOUSE LOOK &nbsp; • &nbsp; SHIFT SPRINT &nbsp; • &nbsp; SPACE JUMP &nbsp; • &nbsp; E INTERACT &nbsp; • &nbsp; V DRIVE CAMERA &nbsp; • &nbsp; L LIGHTS &nbsp; • &nbsp; LMB / F PULSE</span></div></div>}
    {phase === 'paused' && <div className="paused"><div>PAUSED</div><button onClick={() => document.getElementById('game-root')?.requestPointerLock()}>RETURN TO CITY</button><small>Click the game window to recapture mouse</small></div>}
    {phase === 'cinematic' && <CinematicOverlay />}
    <MissionOverlay />
  </div>;
}

function App() {
  const root = React.useRef<HTMLDivElement>(null);
  return <div id="game-root" ref={root} className="gameRoot"><Input root={root} /><Canvas shadows camera={{ position: [-9, 2.77, 20], fov: 66, near: .05, far: 520 }} gl={{ antialias: true, powerPreference: 'high-performance', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.06 }} onCreated={({ gl }) => { gl.shadowMap.type = THREE.PCFSoftShadowMap; }}><CinematicCamera /><World /></Canvas><HUD /></div>;
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
