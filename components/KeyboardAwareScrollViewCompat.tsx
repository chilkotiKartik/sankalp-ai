import { Platform, ScrollView, ScrollViewProps } from "react-native";

type Props = ScrollViewProps & {
  keyboardShouldPersistTaps?: "always" | "never" | "handled";
  [key: string]: any;
};

let KeyboardAwareScrollView: React.ComponentType<Props> | null = null;
try {
  KeyboardAwareScrollView =
    require("react-native-keyboard-controller").KeyboardAwareScrollView;
} catch {
  KeyboardAwareScrollView = null;
}

export function KeyboardAwareScrollViewCompat({
  children,
  keyboardShouldPersistTaps = "handled",
  ...props
}: Props) {
  if (Platform.OS === "web" || !KeyboardAwareScrollView) {
    return (
      <ScrollView
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        {...props}
      >
        {children}
      </ScrollView>
    );
  }

  const KASV = KeyboardAwareScrollView;
  return (
    <KASV keyboardShouldPersistTaps={keyboardShouldPersistTaps} {...props}>
      {children}
    </KASV>
  );
}
