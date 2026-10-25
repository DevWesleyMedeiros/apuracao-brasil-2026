import { configSchema } from "./types";
// Hipóteses de engenharia, NÃO parâmetros eleitorais calibrados. Alterações exigem uma nova versão.
export const MODEL_CONFIG = configSchema.parse({
  version: "logit-v1-experimental",
  decayDays: 10,
  designEffect: 1.8,
  commonSigmaP: 0.02,
  driftSigmaPPerSqrtDay: 0.003,
  distribution: "student",
  degreesOfFreedom: 5,
  simulations: 4000,
  seed: 20261025,
  houseEffectsEnabled: false,
});
export const FLAGS = {
  preEnabled: true,
  liveEnabled: false,
  publicProbabilityEnabled: false,
} as const;
