import { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface IntelligenceOrbProps {
  darkMode: boolean;
}

export const IntelligenceOrb: React.FC<IntelligenceOrbProps> = ({ darkMode }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const wireframeRef = useRef<THREE.LineSegments | null>(null);
  const particlesRef = useRef<THREE.Points | null>(null);
  const glowRef = useRef<THREE.PointLight | null>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const targetRotRef = useRef({ x: 0, y: 0 });

  // Update colors when theme changes
  useEffect(() => {
    if (!wireframeRef.current || !particlesRef.current || !glowRef.current) return;
    const color = darkMode ? 0xffffff : 0x3182ce;
    const glowColor = darkMode ? 0x3182ce : 0x3182ce;
    (wireframeRef.current.material as THREE.LineBasicMaterial).color.setHex(color);
    (wireframeRef.current.material as THREE.LineBasicMaterial).opacity = darkMode ? 0.25 : 0.4;
    (particlesRef.current.material as THREE.PointsMaterial).color.setHex(color);
    (particlesRef.current.material as THREE.PointsMaterial).opacity = darkMode ? 0.6 : 0.8;
    glowRef.current.color.setHex(glowColor);
  }, [darkMode]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Always animate -- orb is decorative, not a seizure risk
    const prefersReduced = false;

    // Scene setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const w = container.clientWidth || 500;
    const h = container.clientHeight || 500;
    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
    camera.position.z = 4;
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Wireframe sphere (icosahedron)
    const icoGeo = new THREE.IcosahedronGeometry(1.4, 2);
    const edgesGeo = new THREE.EdgesGeometry(icoGeo);
    const wireColor = darkMode ? 0xffffff : 0x3182ce;
    const wireMat = new THREE.LineBasicMaterial({
      color: wireColor,
      transparent: true,
      opacity: darkMode ? 0.25 : 0.4,
    });
    const wireframe = new THREE.LineSegments(edgesGeo, wireMat);
    scene.add(wireframe);
    wireframeRef.current = wireframe;

    // Inner solid sphere (very subtle fill)
    const innerGeo = new THREE.IcosahedronGeometry(1.38, 2);
    const innerMat = new THREE.MeshBasicMaterial({
      color: darkMode ? 0x3182ce : 0x3182ce,
      transparent: true,
      opacity: 0.03,
      side: THREE.DoubleSide,
    });
    const innerSphere = new THREE.Mesh(innerGeo, innerMat);
    scene.add(innerSphere);

    // Orbiting particles
    const particleCount = 90;
    const positions = new Float32Array(particleCount * 3);
    const speeds = new Float32Array(particleCount);

    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2;
      const radius = 1.8 + (Math.random() - 0.5) * 0.4;
      const yOffset = (Math.random() - 0.5) * 0.6;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = yOffset;
      positions[i * 3 + 2] = Math.sin(angle) * radius;
      speeds[i] = 0.3 + Math.random() * 0.7;
    }

    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const particleMat = new THREE.PointsMaterial({
      color: wireColor,
      size: 0.03,
      transparent: true,
      opacity: darkMode ? 0.6 : 0.8,
      sizeAttenuation: true,
    });

    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);
    particlesRef.current = particles;

    // Second ring of particles (tilted)
    const ring2Positions = new Float32Array(60 * 3);
    for (let i = 0; i < 60; i++) {
      const angle = (i / 60) * Math.PI * 2;
      const radius = 2.1 + (Math.random() - 0.5) * 0.3;
      ring2Positions[i * 3] = Math.cos(angle) * radius;
      ring2Positions[i * 3 + 1] = Math.sin(angle) * radius * 0.3;
      ring2Positions[i * 3 + 2] = Math.sin(angle) * radius;
    }
    const ring2Geo = new THREE.BufferGeometry();
    ring2Geo.setAttribute('position', new THREE.BufferAttribute(ring2Positions, 3));
    const ring2Mat = new THREE.PointsMaterial({
      color: wireColor,
      size: 0.02,
      transparent: true,
      opacity: darkMode ? 0.3 : 0.5,
      sizeAttenuation: true,
    });
    const ring2 = new THREE.Points(ring2Geo, ring2Mat);
    ring2.rotation.x = Math.PI * 0.35;
    ring2.rotation.z = Math.PI * 0.15;
    scene.add(ring2);

    // Glow light
    const glow = new THREE.PointLight(0x3182ce, 0.8, 8);
    glow.position.set(0, 0, 0);
    scene.add(glow);
    glowRef.current = glow;

    // Ambient light
    const ambient = new THREE.AmbientLight(0xffffff, 0.1);
    scene.add(ambient);

    // Mouse tracking
    const onMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouseRef.current.x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      mouseRef.current.y = -((e.clientY - rect.top) / rect.height - 0.5) * 2;
    };
    container.addEventListener('mousemove', onMouseMove);

    // Animation
    let animId: number;
    let time = 0;

    const animate = () => {
      time += 0.005;

      if (!prefersReduced) {
        // Slow auto-rotation
        wireframe.rotation.y += 0.002;
        wireframe.rotation.x += 0.0005;
        innerSphere.rotation.y = wireframe.rotation.y;
        innerSphere.rotation.x = wireframe.rotation.x;

        // Mouse-reactive tilt (damped)
        targetRotRef.current.x += (mouseRef.current.y * 0.3 - targetRotRef.current.x) * 0.05;
        targetRotRef.current.y += (mouseRef.current.x * 0.3 - targetRotRef.current.y) * 0.05;
        wireframe.rotation.x += targetRotRef.current.x * 0.02;
        wireframe.rotation.y += targetRotRef.current.y * 0.02;

        // Orbit particles
        particles.rotation.y += 0.003;
        ring2.rotation.y -= 0.002;

        // Subtle pulse on glow
        glow.intensity = 0.6 + Math.sin(time * 4) * 0.2;

        // Animate individual particles up/down
        const pos = particleGeo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < particleCount; i++) {
          const baseY = (Math.random() - 0.5) * 0.001;
          pos.setY(i, pos.getY(i) + Math.sin(time * speeds[i] * 2 + i) * 0.001 + baseY);
        }
        pos.needsUpdate = true;
      }

      renderer.render(scene, camera);
      animId = requestAnimationFrame(animate);
    };

    // Resize
    const resize = () => {
      if (!container) return;
      const cw = container.clientWidth;
      const ch = container.clientHeight;
      camera.aspect = cw / ch;
      camera.updateProjectionMatrix();
      renderer.setSize(cw, ch);
    };

    window.addEventListener('resize', resize);
    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      container.removeEventListener('mousemove', onMouseMove);
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
      style={{ minHeight: 300 }}
    />
  );
};
