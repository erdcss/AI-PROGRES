import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Image,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { peekLoggedIn, restoreAppSession, saveAppSession, subscribeAuth, verifyAppPassword } from "../lib/app-auth";
import { colors } from "../theme/colors";

export function LoginGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [loggedIn, setLoggedIn] = useState(peekLoggedIn());
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    const unsub = subscribeAuth(() => setLoggedIn(peekLoggedIn()));
    void restoreAppSession().then((ok) => {
      setLoggedIn(ok);
      setReady(true);
    });
    return unsub;
  }, []);

  const onSubmit = () => {
    if (!verifyAppPassword(password)) {
      setError(true);
      return;
    }
    setError(false);
    setPassword("");
    void saveAppSession().then(() => setLoggedIn(true));
  };

  if (!ready) return <View style={styles.root} />;
  if (loggedIn) return <>{children}</>;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.card}>
        <Image source={require("../../assets/icon.png")} style={styles.logo} resizeMode="contain" />
        <Text style={styles.title}>ORVIAN</Text>
        <Text style={styles.copy}>Web panelindeki şifre ile giriş yapın</Text>
        <TextInput
          value={password}
          onChangeText={(v) => {
            setPassword(v);
            if (error) setError(false);
          }}
          placeholder="Şifre"
          placeholderTextColor="#71717A"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={onSubmit}
          style={[styles.input, error && styles.inputErr]}
        />
        {error ? <Text style={styles.err}>Hatalı şifre</Text> : null}
        <Pressable onPress={onSubmit} style={({ pressed }) => [styles.btn, pressed && styles.pressed]}>
          <Text style={styles.btnText}>GİRİŞ YAP</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#2A2A2A",
    backgroundColor: "#0B0B0B",
    padding: 22,
  },
  logo: { width: 72, height: 72, alignSelf: "center", marginBottom: 12 },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: "700",
    letterSpacing: 4,
    textAlign: "center",
  },
  copy: {
    color: "#8A8A8A",
    fontSize: 13,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 18,
  },
  input: {
    borderWidth: 1,
    borderColor: "#2A2A2A",
    borderRadius: 12,
    backgroundColor: "#111",
    color: colors.text,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  inputErr: { borderColor: "#EF4444" },
  err: { color: "#EF4444", fontSize: 12, marginTop: 8 },
  btn: {
    marginTop: 16,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#3A3A3A",
    backgroundColor: "#E4E4E7",
    paddingVertical: 13,
    alignItems: "center",
  },
  btnText: { color: "#000", fontWeight: "700", letterSpacing: 1.6, fontSize: 13 },
  pressed: { opacity: 0.8 },
});
