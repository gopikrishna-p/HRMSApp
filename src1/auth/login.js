import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Image,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import axios from "axios";
import Config from "react-native-config";
import { format } from "date-fns";
import Icon from "react-native-vector-icons/FontAwesome";
import { Button } from "react-native-paper";
import { storeSession, isAdminUser, getSession } from "./authStore";
import showToast from "../utils/Toast";

const BASE_URL = Config.BASE_URL;

function LoginScreen({ navigation }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [buttonDisable, setButtonDisable] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  useEffect(() => {
    checkExistingSession();
  }, []);

  const checkExistingSession = async () => {
    try {
      const session = await getSession();
      if (session && session.sid) {
        console.log("Existing session found, navigating...");
        const isAdmin = isAdminUser(session.userDetails.roles);
        const targetRoute = isAdmin ? "AdminNavigator" : "DrawerNavigator";

        navigation.reset({
          index: 0,
          routes: [{ name: targetRoute }],
        });
      }
    } catch (error) {
      console.log("No existing session:", error.message);
    } finally {
      setIsCheckingSession(false);
    }
  };

  const handleLogin = async () => {
    if (buttonDisable) return;

    setButtonDisable(true);
    setErrorMessage("");

    try {
      // Input validation
      if (!username.trim() || !password.trim()) {
        setErrorMessage("Username and password are required.");
        return;
      }

      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(username)) {
        setErrorMessage("Please enter a valid email address.");
        return;
      }

      const loginData = {
        usr: username.trim(),
        pwd: password,
      };

      console.log("Attempting login to:", `${BASE_URL}/api/method/login`);

      // Login request
      const response = await axios.post(
        `${BASE_URL}/api/method/login`,
        loginData,
        {
          timeout: 15000,
          validateStatus: (status) => status < 500,
        }
      );

      console.log("Login response status:", response.status);

      if (response.status === 401) {
        setErrorMessage("Invalid username or password.");
        return;
      }

      if (response && response.data.message === "Logged In") {
        const cookies = response.headers["set-cookie"];
        console.log("Login successful, processing cookies...");

        let email = username.trim();
        let sid = null;

        // Extract session ID from cookies
        if (cookies && Array.isArray(cookies)) {
          for (const cookie of cookies) {
            if (cookie.startsWith("sid=")) {
              sid = cookie.split(";")[0].split("=")[1];
              console.log("Extracted SID");

              const userIdCookie = cookies.find((c) =>
                c.startsWith("user_id=")
              );
              if (userIdCookie) {
                email = decodeURIComponent(
                  userIdCookie.split(";")[0].split("=")[1]
                );
                console.log("Extracted email from user_id cookie");
              }
              break;
            }
          }
        }

        if (!sid) {
          throw new Error("No session cookie received from server");
        }

        // Fetch user info with roles
        console.log("Fetching user information...");
        const userInfoResponse = await axios.get(
          `${BASE_URL}/api/method/hrms.api.get_current_user_info`,
          {
            headers: { Cookie: `sid=${sid}` },
            timeout: 10000,
          }
        );

        const { roles, first_name, full_name } = userInfoResponse.data.message;

        if (!roles || !Array.isArray(roles) || roles.length === 0) {
          throw new Error("Invalid user roles received from server");
        }

        console.log("User roles:", roles);

        // Fetch employee details
        console.log("Fetching employee details...");
        const employeeResponse = await axios.get(
          `${BASE_URL}/api/resource/Employee`,
          {
            headers: { Cookie: `sid=${sid}` },
            params: {
              fields: JSON.stringify([
                "name",
                "employee_name",
                "designation",
                "department",
                "ctc",
                "company",
                "image",
                "expense_approver",
                "shift_request_approver",
                "leave_approver",
                "default_shift",
                "custom_wfh_eligible",
                "status",
              ]),
              filters: JSON.stringify([["user_id", "=", email]]),
            },
            timeout: 10000,
          }
        );

        if (
          employeeResponse.status !== 200 ||
          !employeeResponse.data.data ||
          employeeResponse.data.data.length === 0
        ) {
          throw new Error(
            "Employee record not found. Please contact your administrator."
          );
        }

        const employeeData = employeeResponse.data.data[0];

        // Check if employee is active
        if (employeeData.status !== "Active") {
          throw new Error(
            "Your employee account is inactive. Please contact HR."
          );
        }

        const employeeName =
          response.data.full_name || employeeData.employee_name;

        let userDetails = {
          sid,
          email,
          employeeName,
          roles,
          first_name,
          full_name,
          ...employeeData,
        };

        // Fetch leave balance (non-critical)
        try {
          console.log("Fetching leave balance...");
          const currentDate = format(new Date(), "yyyy-MM-dd");

          const reportResponse = await axios.get(
            `${BASE_URL}/api/method/frappe.desk.query_report.run`,
            {
              headers: { Cookie: `sid=${sid}` },
              params: {
                report_name: "Employee Leave Balance Summary",
                filters: JSON.stringify({
                  employee: userDetails.name,
                  company: userDetails.company,
                  date: currentDate,
                }),
                ignore_prepared_report: 1,
              },
              timeout: 8000,
            }
          );

          if (
            reportResponse.data &&
            reportResponse.data.message &&
            reportResponse.data.message.result
          ) {
            const { department, employee, employee_name, ...leaveData } =
              reportResponse.data.message.result;

            if (leaveData && leaveData[0]) {
              userDetails = {
                ...userDetails,
                ...leaveData[0],
              };
              console.log("Leave balance added to user details");
            }
          }
        } catch (leaveError) {
          console.log(
            "Leave balance fetch failed (non-critical):",
            leaveError.message
          );
        }

        // Store session
        console.log("Storing session...");
        await storeSession(sid, userDetails);

        // Verify session was stored
        const storedSession = await getSession();
        if (!storedSession) {
          throw new Error("Failed to store session locally");
        }

        const isAdmin = isAdminUser(roles);
        console.log("Login successful:", {
          userId: userDetails.name,
          isAdmin,
          roles,
        });

        // Navigate to appropriate screen
        const targetRoute = isAdmin ? "AdminNavigator" : "DrawerNavigator";
        console.log(`Navigating to: ${targetRoute}`);

        navigation.reset({
          index: 0,
          routes: [{ name: targetRoute }],
        });

        // Clear inputs
        setPassword("");
        setUsername("");

        showToast({
          type: "success",
          text1: "Login Successful",
          text2: `Welcome ${userDetails.first_name || userDetails.employeeName}!`,
        });
      } else {
        setErrorMessage("Login failed. Please try again.");
      }
    } catch (error) {
      console.error("Login error:", error);

      if (error.response) {
        const status = error.response.status;
        if (status === 401) {
          setErrorMessage("Invalid username or password.");
        } else if (status === 403) {
          setErrorMessage("Access denied. Contact your administrator.");
        } else if (status === 500) {
          setErrorMessage("Server error. Please try again later.");
        } else {
          setErrorMessage(`Server error: ${status}. Please try again.`);
        }
      } else if (error.code === "ECONNABORTED") {
        setErrorMessage(
          "Request timeout. Please check your connection and try again."
        );
      } else if (error.message === "Network Error") {
        setErrorMessage("Network error. Please check your internet connection.");
      } else {
        setErrorMessage(
          error.message || "An unexpected error occurred. Please try again."
        );
      }

      showToast({
        type: "error",
        text1: "Login Failed",
        text2: error.message || "Please try again",
      });
    } finally {
      setButtonDisable(false);
    }
  };

  if (isCheckingSession) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#003f82" />
        <Text style={styles.loadingText}>Checking session...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.imageContainer}>
          <Image
            style={styles.image}
            source={require("../../assets/mainLogo.jpg")}
            resizeMode="contain"
          />
        </View>

        <View style={styles.innerContainer}>
          <Text style={styles.title}>Welcome Back</Text>
          <Text style={styles.subtitle}>Sign in to continue</Text>

          <Text style={styles.label}>Email Address</Text>
          <TextInput
            style={styles.input}
            placeholder="Enter your email"
            placeholderTextColor="#999"
            onChangeText={setUsername}
            value={username}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            editable={!buttonDisable}
            returnKeyType="next"
          />

          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordContainer}>
            <TextInput
              style={styles.passwordInput}
              placeholder="Enter your password"
              placeholderTextColor="#999"
              onChangeText={setPassword}
              secureTextEntry={!isPasswordVisible}
              value={password}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!buttonDisable}
              returnKeyType="go"
              onSubmitEditing={handleLogin}
            />
            <TouchableOpacity
              onPress={() => setIsPasswordVisible(!isPasswordVisible)}
              disabled={buttonDisable}
            >
              <Icon
                name={isPasswordVisible ? "eye-slash" : "eye"}
                size={20}
                color={buttonDisable ? "#ccc" : "#666"}
                style={styles.eyeIcon}
              />
            </TouchableOpacity>
          </View>

          {errorMessage ? (
            <View style={styles.errorContainer}>
              <Icon name="exclamation-circle" size={16} color="#d32f2f" />
              <Text style={styles.errorMessage}>{errorMessage}</Text>
            </View>
          ) : null}

          <Button
            mode="contained"
            onPress={handleLogin}
            buttonColor="#003f82"
            textColor="white"
            disabled={buttonDisable}
            loading={buttonDisable}
            style={styles.loginButton}
            contentStyle={styles.loginButtonContent}
          >
            {buttonDisable ? "Logging in..." : "Login"}
          </Button>

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Having trouble logging in?
            </Text>
            <Text style={styles.footerLink}>Contact Support</Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#666",
  },
  innerContainer: {
    width: "100%",
    maxWidth: 400,
    alignSelf: "center",
    backgroundColor: "white",
    borderRadius: 16,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  imageContainer: {
    alignItems: "center",
    marginBottom: 32,
  },
  image: {
    width: 200,
    height: 100,
  },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#003f82",
    marginBottom: 8,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    marginBottom: 32,
    textAlign: "center",
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
    color: "#333",
  },
  input: {
    height: 48,
    borderColor: "#ddd",
    borderWidth: 1,
    marginBottom: 20,
    paddingHorizontal: 16,
    borderRadius: 8,
    color: "#333",
    fontSize: 16,
    backgroundColor: "#fafafa",
  },
  passwordContainer: {
    height: 48,
    flexDirection: "row",
    borderColor: "#ddd",
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 20,
    alignItems: "center",
    backgroundColor: "#fafafa",
  },
  passwordInput: {
    flex: 1,
    height: 48,
    paddingHorizontal: 16,
    color: "#333",
    fontSize: 16,
  },
  eyeIcon: {
    marginRight: 16,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffebee",
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  errorMessage: {
    color: "#d32f2f",
    marginLeft: 8,
    fontSize: 14,
    flex: 1,
  },
  loginButton: {
    marginTop: 8,
    borderRadius: 8,
  },
  loginButtonContent: {
    height: 48,
  },
  footer: {
    marginTop: 24,
    alignItems: "center",
  },
  footerText: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
  },
  footerLink: {
    fontSize: 14,
    color: "#003f82",
    fontWeight: "600",
  },
});

export default LoginScreen;