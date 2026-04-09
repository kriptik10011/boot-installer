import { describe, it, expect } from 'vitest';
import { latticeFragmentShader, LATTICE_DEFAULTS } from './latticeShader';

describe('latticeShader', () => {
  describe('shader strings', () => {
    it('fragment shader contains TPMS eval function', () => {
      expect(latticeFragmentShader).toContain('evalAndGradTPMS');
    });

    it('fragment shader contains sphere intersection', () => {
      expect(latticeFragmentShader).toContain('intersectSphere');
    });

    it('fragment shader contains PBR Cook-Torrance', () => {
      expect(latticeFragmentShader).toContain('shadePBR');
      expect(latticeFragmentShader).toContain('distributionGGX');
      expect(latticeFragmentShader).toContain('geometrySmith');
      expect(latticeFragmentShader).toContain('fresnelSchlick');
    });

    it('fragment shader contains OKLab color space', () => {
      expect(latticeFragmentShader).toContain('linearToOklab');
      expect(latticeFragmentShader).toContain('oklabToLinear');
    });

    it('fragment shader has NaN guard', () => {
      expect(latticeFragmentShader).toContain('col.r != col.r');
    });

    it('fragment shader has bicontinuous mode switch', () => {
      expect(latticeFragmentShader).toContain('uTPMSMode');
    });

    it('fragment shader has multi-hit translucency', () => {
      expect(latticeFragmentShader).toContain('uTranslucency');
      expect(latticeFragmentShader).toContain('uMaxLayers');
    });

    it('fragment shader has 4-domain architecture', () => {
      expect(latticeFragmentShader).toContain('uDomainType');
      expect(latticeFragmentShader).toContain('uDomainFreq');
      expect(latticeFragmentShader).toContain('uDomainGradColor');
    });
  });

  describe('LATTICE_DEFAULTS', () => {
    it('has core uniform keys', () => {
      const requiredKeys = [
        'uTime', 'uResolution', 'uCamPos', 'uCamTarget',
        'uMaxSteps', 'uBrightness', 'uClipRadius',
        'uDomainType', 'uDomainFreq', 'uDomainThick', 'uDomainIso',
        'uDomainGradColor', 'uMetallic', 'uRoughness', 'uSssIntensity',
        'uTPMSMode', 'uTranslucency', 'uMaxLayers',
      ];
      for (const key of requiredKeys) {
        expect(LATTICE_DEFAULTS).toHaveProperty(key);
      }
    });

    it('does NOT have old removed uniforms', () => {
      const removed = [
        'u_density', 'u_sharpness', 'u_renderMode',
        'u_chaosLevel', 'u_foldDepth', 'u_juliaBlend',
      ];
      for (const key of removed) {
        expect(LATTICE_DEFAULTS).not.toHaveProperty(key);
      }
    });
  });
});
