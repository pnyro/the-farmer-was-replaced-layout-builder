// 3D renderer (react-three-fiber). Same editor core as the 2D view: this component only renders
// the state and turns pointer rays into tile coordinates.

import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, ToneMapping } from "@react-three/postprocessing";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useEditor, useEditorState } from "../core/useEditor.js";
import { FarmLayers, tileToWorld, worldToTile } from "./FarmLayers.js";
import { DRONE_MOTORS, buildSlab, createMaterial, getGeometry } from "./models.js";
import { labelMaterial } from "./labels.js";
import { BACKGROUND } from "./palette.js";

// postprocessing's ToneMappingMode.ACES_FILMIC (not imported directly to avoid a second dependency).
const ACES_FILMIC = 6;
const ELEVATION = THREE.MathUtils.degToRad(56);
const AZIMUTH = THREE.MathUtils.degToRad(14);

const FOV = 30;

/** Default orbit position: steep three-quarter view that frames the whole farm. */
const cameraHome = (n, aspect = 1.5) => {
  const radius = (n + 0.6) * 0.62 + 0.8; // the slab seen from above, plus the drone
  const vHalf = THREE.MathUtils.degToRad(FOV / 2);
  const hHalf = Math.atan(Math.tan(vHalf) * aspect);
  const dist = radius / Math.sin(Math.min(vHalf, hHalf));
  return new THREE.Vector3(
    Math.sin(AZIMUTH) * Math.cos(ELEVATION) * dist,
    Math.sin(ELEVATION) * dist,
    Math.cos(AZIMUTH) * Math.cos(ELEVATION) * dist,
  );
};

function Slab({ size }) {
  const geo = useMemo(() => buildSlab(size), [size]);
  const mat = useMemo(() => createMaterial(), []);
  useEffect(() => () => geo.dispose(), [geo]);
  useEffect(() => () => mat.dispose(), [mat]);
  return <mesh geometry={geo} material={mat} castShadow receiveShadow raycast={() => null} />;
}

function Sun({ size }) {
  const ref = useRef();
  const { scene } = useThree();
  useEffect(() => {
    const light = ref.current;
    const r = size * 0.8 + 3;
    const cam = light.shadow.camera;
    cam.left = -r;
    cam.right = r;
    cam.top = r;
    cam.bottom = -r;
    cam.near = 0.5;
    cam.far = size * 4 + 30;
    cam.updateProjectionMatrix();
    light.shadow.mapSize.set(size > 16 ? 4096 : 2048, size > 16 ? 4096 : 2048);
    light.shadow.map?.dispose();
    light.shadow.map = null;
    light.position.set(-size * 0.75 - 4, size * 1.25 + 6, size * 0.55 + 3);
    light.target.position.set(0, 0, 0);
    scene.add(light.target);
    return () => scene.remove(light.target);
  }, [size, scene]);
  return (
    <directionalLight
      ref={ref}
      color="#ffd9a3"
      intensity={2.9}
      castShadow
      shadow-bias={-0.0004}
      shadow-normalBias={0.025}
      shadow-radius={4}
    />
  );
}

function Drone({ size }) {
  const group = useRef();
  const props = useRef([]);
  const mat = useMemo(() => createMaterial(), []);
  useEffect(() => () => mat.dispose(), [mat]);
  const [wx, , wz] = tileToWorld(0, 0, size);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (group.current) {
      group.current.position.y = 1.55 + Math.sin(t * 1.6) * 0.08;
      group.current.rotation.z = Math.sin(t * 0.9) * 0.04;
      group.current.rotation.x = Math.cos(t * 0.7) * 0.04;
    }
    props.current.forEach((p, k) => p && (p.rotation.y = t * 22 * (k % 2 ? 1 : -1)));
  });
  return (
    <group ref={group} position={[wx, 1.55, wz]} scale={0.95} raycast={() => null}>
      <mesh geometry={getGeometry("drone:body")} material={mat} castShadow raycast={() => null} />
      {DRONE_MOTORS.map((p, k) => (
        <mesh
          key={k}
          ref={(el) => (props.current[k] = el)}
          position={p}
          geometry={getGeometry("drone:prop")}
          material={mat}
          castShadow
          raycast={() => null}
        />
      ))}
    </group>
  );
}

/** Instanced farm content, updated straight from the editor store. */
function FarmContent() {
  const editor = useEditor();
  const group = useRef();
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const layers = new FarmLayers(group.current);
    let lastCells = null;
    let lastAnalysis = null;
    const update = () => {
      const st = editor.getState();
      const cells = st.preview?.cells ?? st.cells;
      const analysis = st.preview?.analysis ?? st.analysis;
      if (cells !== lastCells || analysis !== lastAnalysis) {
        layers.updateContent(cells, st.size, analysis);
        lastCells = cells;
        lastAnalysis = analysis;
      }
      layers.updateOverlays(st);
      invalidate();
    };
    update();
    const unsub = editor.subscribe(update);
    return () => {
      unsub();
      layers.dispose();
    };
  }, [editor, invalidate]);
  return <group ref={group} />;
}

/** Invisible plane that turns pointer rays into tile coordinates. */
function PointerPlane({ size, spaceDown }) {
  const editor = useEditor();
  const toTile = (e) => worldToTile(e.point.x, e.point.z, size);
  const mods = (e) => ({ shift: e.nativeEvent.shiftKey, alt: e.nativeEvent.altKey });
  return (
    <mesh
      rotation-x={-Math.PI / 2}
      position-y={0.001}
      onPointerDown={(e) => {
        if (e.button !== 0 || spaceDown.current) return;
        if (e.nativeEvent.pointerType === "touch" && e.nativeEvent.isPrimary === false) return;
        e.stopPropagation();
        e.target.setPointerCapture(e.pointerId);
        editor.pointerDown(toTile(e), mods(e));
      }}
      onPointerMove={(e) => editor.pointerMove(toTile(e), mods(e))}
      onPointerUp={(e) => {
        if (e.target.hasPointerCapture?.(e.pointerId)) e.target.releasePointerCapture(e.pointerId);
        editor.pointerUp();
      }}
      onPointerLeave={() => editor.pointerLeave()}
    >
      <planeGeometry args={[size + 40, size + 40]} />
      <meshBasicMaterial visible={false} />
    </mesh>
  );
}

function Label({ text, position, height = 0.0125, style, center = [0.5, 0.5] }) {
  const { material, aspect } = labelMaterial(text, style);
  return (
    <sprite
      material={material}
      position={position}
      scale={[height * aspect, height, 1]}
      center={center}
      renderOrder={5}
      raycast={() => null}
    />
  );
}

function Labels({ size }) {
  const every = size > 20 ? 2 : 1;
  const ticks = [];
  for (let i = 0; i < size; i++) if (i % every === 0 || i === size - 1) ticks.push(i);
  const half = size / 2;
  return (
    <group>
      {ticks.map((x) => (
        <Label key={`x${x}`} text={String(x)} position={[tileToWorld(x, 0, size)[0], -0.45, half + 0.65]} />
      ))}
      {ticks.map((y) => (
        <Label key={`y${y}`} text={String(y)} position={[-half - 0.65, -0.45, tileToWorld(0, y, size)[2]]} />
      ))}
      <Label text="N ↑" position={[0, 0.25, -half - 0.8]} />
    </group>
  );
}

function MergeLabels({ size }) {
  const merges = useEditorState((s) => (s.preview?.analysis ?? s.analysis).merges);
  return merges.map((m) => {
    const [wx, , wz] = tileToWorld(m.x - 0.5, m.y + m.n - 0.5, size);
    return (
      <Label
        key={`${m.x},${m.y},${m.n}`}
        text={`${m.n}×${m.n}`}
        position={[wx + 0.12, 0.12, wz + 0.12]}
        height={0.0115}
        center={[0, 1]}
        style={{ color: "#3a2400", background: "#ff9a1f", weight: 700 }}
      />
    );
  });
}

function CameraRig({ size, apiRef, controls }) {
  const { camera, size: viewport } = useThree();
  const aspect = viewport.width / Math.max(1, viewport.height);
  const home = () => {
    camera.position.copy(cameraHome(size, aspect));
    camera.lookAt(0, 0, 0);
    controls.current?.target.set(0, 0, 0);
    controls.current?.update();
  };
  const homeRef = useRef(home);
  homeRef.current = home;
  useEffect(() => {
    homeRef.current();
  }, [size]);
  useEffect(() => {
    const dolly = (f) => {
      const c = controls.current;
      if (!c) return;
      const offset = camera.position.clone().sub(c.target).multiplyScalar(f);
      const len = THREE.MathUtils.clamp(offset.length(), c.minDistance, c.maxDistance);
      camera.position.copy(c.target).add(offset.setLength(len));
      c.update();
    };
    apiRef.current = {
      zoomIn: () => dolly(0.8),
      zoomOut: () => dolly(1.25),
      fit: () => homeRef.current(),
    };
  }, [apiRef, camera, controls]);
  return null;
}

export default function Farm3D({ apiRef }) {
  const size = useEditorState((s) => s.size);
  const showIssues = useEditorState((s) => s.showIssues);
  const showGrid = useEditorState((s) => s.showGrid);
  const controls = useRef();
  const spaceDown = useRef(false);

  useEffect(() => {
    const onKey = (e) => {
      if (e.code !== "Space") return;
      const t = e.target;
      if (t instanceof HTMLElement && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      spaceDown.current = e.type === "keydown";
      if (controls.current) controls.current.mouseButtons.LEFT = spaceDown.current ? THREE.MOUSE.ROTATE : null;
      if (e.type === "keydown") e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, []);

  return (
    <div className="farm-view farm-view-3d" onContextMenu={(e) => e.preventDefault()}>
      <Canvas
        shadows="soft"
        dpr={[1, 2]}
        camera={{ fov: FOV, near: 0.1, far: 600, position: cameraHome(size).toArray() }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
        aria-label="Farm layout, 3D view"
      >
        <color attach="background" args={[BACKGROUND]} />
        <hemisphereLight args={["#d8e2f0", "#6b5536", 1.15]} />
        <ambientLight intensity={0.15} />
        <Sun size={size} />
        <Slab size={size} />
        <FarmContent />
        <Drone size={size} />
        <PointerPlane size={size} spaceDown={spaceDown} />
        {showGrid && <Labels size={size} />}
        {showIssues && <MergeLabels size={size} />}
        <OrbitControls
          ref={controls}
          makeDefault
          enableDamping
          dampingFactor={0.12}
          mouseButtons={{ LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE }}
          touches={{ ONE: null, TWO: THREE.TOUCH.DOLLY_PAN }}
          minDistance={3}
          maxDistance={160}
          maxPolarAngle={Math.PI * 0.46}
          screenSpacePanning={false}
        />
        <CameraRig size={size} apiRef={apiRef} controls={controls} />
        <EffectComposer multisampling={4}>
          <Bloom intensity={0.25} luminanceThreshold={0.85} luminanceSmoothing={0.2} mipmapBlur />
          <ToneMapping mode={ACES_FILMIC} />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
