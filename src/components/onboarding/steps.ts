import AboutYou from "$components/onboarding/AboutYou.svelte";
import Privacy from "$components/onboarding/Privacy.svelte";

export type Step = {
  description: string;
  dataset: string;
  component: any;
};

const steps: Step[] = [
  {
    description: "About you",
    dataset: "bio",
    component: AboutYou,
  },
  {
    description: "Privacy",
    dataset: "privacy",
    component: Privacy,
  },
];

export default steps;
