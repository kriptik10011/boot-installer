import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { FluidSimulation, type FluidParams } from './fluidSimulation';

// ── Mock GPUComputationRenderer ─────────────────────────────────────────

const mockTexture = new THREE.Texture();

const mockVariable = {
  material: {
    uniforms: {} as Record<string, { value: unknown }>,
  },
  name: 'test',
};

const mockGpuCompute = {
  createTexture: vi.fn(() => {
    const dt = new THREE.DataTexture(
      new Float32Array(128 * 128 * 4),
      128,
      128,
      THREE.RGBAFormat,
      THREE.FloatType,
    );
    return dt;
  }),
  addVariable: vi.fn(() => ({ ...mockVariable, material: { uniforms: {} } })),
  setVariableDependencies: vi.fn(),
  init: vi.fn(() => null),
  compute: vi.fn(),
  getCurrentRenderTarget: vi.fn(() => ({ texture: mockTexture })),
  dispose: vi.fn(),
};

vi.mock('three/examples/jsm/misc/GPUComputationRenderer.js', () => ({
  GPUComputationRenderer: vi.fn(() => mockGpuCompute),
}));

// ── Tests ───────────────────────────────────────────────────────────────

describe('FluidSimulation', () => {
  let mockRenderer: THREE.WebGLRenderer;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset uniforms for each addVariable call
    mockGpuCompute.addVariable.mockImplementation(() => ({
      ...mockVariable,
      material: { uniforms: {} },
    }));
    mockGpuCompute.init.mockReturnValue(null);
    mockRenderer = {} as THREE.WebGLRenderer;
  });

  it('creates instance without error', () => {
    const sim = new FluidSimulation(mockRenderer, 128);
    expect(sim).toBeDefined();
  });

  it('calls GPUComputationRenderer init and throws on failure', () => {
    mockGpuCompute.init.mockReturnValueOnce('WebGL error' as unknown as null);
    expect(() => new FluidSimulation(mockRenderer, 128)).toThrow('GPGPU init failed');
  });

  it('creates two compute variables (velocity + density)', () => {
    new FluidSimulation(mockRenderer, 128);
    expect(mockGpuCompute.addVariable).toHaveBeenCalledTimes(2);

    const firstCall = mockGpuCompute.addVariable.mock.calls[0] as unknown[];
    const secondCall = mockGpuCompute.addVariable.mock.calls[1] as unknown[];
    expect(firstCall[0]).toBe('textureVelocity');
    expect(secondCall[0]).toBe('textureDensity');
  });

  it('wires correct variable dependencies', () => {
    new FluidSimulation(mockRenderer, 128);
    expect(mockGpuCompute.setVariableDependencies).toHaveBeenCalledTimes(2);
  });

  it('update calls gpuCompute.compute()', () => {
    const sim = new FluidSimulation(mockRenderer, 128);
    sim.update(0.016, new THREE.Vector2(0.5, 0.5), new THREE.Vector2(0, 0));
    expect(mockGpuCompute.compute).toHaveBeenCalledTimes(1);
  });

  it('update clamps dt to prevent instability', () => {
    const sim = new FluidSimulation(mockRenderer, 128);
    // Should not throw even with extreme dt values
    sim.update(0.5, new THREE.Vector2(0.5, 0.5), new THREE.Vector2(0, 0));
    sim.update(0.0001, new THREE.Vector2(0.5, 0.5), new THREE.Vector2(0, 0));
    expect(mockGpuCompute.compute).toHaveBeenCalledTimes(2);
  });

  it('getVelocityTexture returns a texture', () => {
    const sim = new FluidSimulation(mockRenderer, 128);
    const tex = sim.getVelocityTexture();
    expect(tex).toBe(mockTexture);
  });

  it('getDensityTexture returns a texture', () => {
    const sim = new FluidSimulation(mockRenderer, 128);
    const tex = sim.getDensityTexture();
    expect(tex).toBe(mockTexture);
  });

  it('setParams performs partial update', () => {
    const sim = new FluidSimulation(mockRenderer, 128);
    // Should not throw
    sim.setParams({ viscosity: 0.95 });
    sim.setParams({ dissipation: 0.93, splatStrength: 1.5 });
  });

  it('dispose calls gpuCompute.dispose()', () => {
    const sim = new FluidSimulation(mockRenderer, 128);
    sim.dispose();
    expect(mockGpuCompute.dispose).toHaveBeenCalledTimes(1);
  });

  it('dispose is safe to call multiple times', () => {
    const sim = new FluidSimulation(mockRenderer, 128);
    sim.dispose();
    sim.dispose();
    // Should only call underlying dispose once
    expect(mockGpuCompute.dispose).toHaveBeenCalledTimes(1);
  });

  it('update is no-op after dispose', () => {
    const sim = new FluidSimulation(mockRenderer, 128);
    sim.dispose();
    mockGpuCompute.compute.mockClear();
    sim.update(0.016, new THREE.Vector2(0.5, 0.5), new THREE.Vector2(0, 0));
    expect(mockGpuCompute.compute).not.toHaveBeenCalled();
  });
});
