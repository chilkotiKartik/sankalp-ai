import { Redirect } from "expo-router";

/** The introduction now lives in the sign-in screen (shown once, on the first visit). Old links land there. */
export default function OnboardingRedirect() {
  return <Redirect href="/(auth)/login" />;
}
