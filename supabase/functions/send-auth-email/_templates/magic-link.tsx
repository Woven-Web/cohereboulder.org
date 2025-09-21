import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
  Button,
  Hr,
} from "npm:@react-email/components@0.0.22";
import * as React from "npm:react@18.3.1";

interface MagicLinkEmailProps {
  userName: string;
  magicLinkUrl: string;
  otpCode: string;
  emailActionType: string;
  previewText: string;
}

export const MagicLinkEmail = ({
  userName,
  magicLinkUrl,
  otpCode,
  emailActionType,
  previewText,
}: MagicLinkEmailProps) => {
  const isSignup = emailActionType === "signup";
  const isRecovery = emailActionType === "recovery";
  
  const getTitle = () => {
    if (isSignup) return "Welcome to COhere Community! 🌱";
    if (isRecovery) return "Reset Your Password";
    return "Sign in to COhere";
  };

  const getGreeting = () => {
    if (isSignup) return `Welcome to the COhere community, ${userName}!`;
    if (isRecovery) return `Hi ${userName},`;
    return `Welcome back, ${userName}!`;
  };

  const getMainMessage = () => {
    if (isSignup) {
      return "We're excited to have you join our regenerative community in Boulder. Click the button below to complete your registration and start exploring all that COhere has to offer.";
    }
    if (isRecovery) {
      return "We received a request to reset your password. Click the button below to create a new password for your COhere account.";
    }
    return "Click the button below to sign in to your COhere account and continue your journey with our regenerative community.";
  };

  const getButtonText = () => {
    if (isSignup) return "Complete Registration";
    if (isRecovery) return "Reset Password";
    return "Sign In to COhere";
  };

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Header with COhere branding */}
          <Section style={header}>
            <Text style={brandText}>COhere</Text>
            <Text style={tagline}>Regenerative Community • Boulder, CO</Text>
          </Section>

          {/* Main content */}
          <Section style={content}>
            <Heading style={h1}>{getTitle()}</Heading>
            
            <Text style={text}>{getGreeting()}</Text>
            
            <Text style={text}>{getMainMessage()}</Text>

            {/* Magic Link Button */}
            <Section style={buttonContainer}>
              <Button href={magicLinkUrl} style={button}>
                {getButtonText()}
              </Button>
            </Section>

            <Hr style={hr} />

            {/* Alternative: OTP Code */}
            <Text style={text}>
              <strong>Or enter this 6-digit code:</strong>
            </Text>
            <Section style={otpContainer}>
              <Text style={otpCode}>{otpCode}</Text>
            </Section>

            <Text style={smallText}>
              This code will expire in 60 minutes for security reasons.
            </Text>

            {isSignup && (
              <>
                <Hr style={hr} />
                <Text style={text}>
                  <strong>What's next?</strong>
                </Text>
                <Text style={text}>
                  • Complete your registration to join events<br/>
                  • Connect with regenerative organizations in Boulder<br/>
                  • Participate in our community gatherings<br/>
                  • Share your own projects and initiatives
                </Text>
              </>
            )}
          </Section>

          {/* Footer */}
          <Section style={footer}>
            <Text style={footerText}>
              COhere Community | Boulder, Colorado<br/>
              Weaving regenerative connections in the Front Range
            </Text>
            <Text style={footerSmall}>
              If you didn't request this email, you can safely ignore it.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
};

export default MagicLinkEmail;

// Styles
const main = {
  backgroundColor: "#f8f9fa",
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif",
};

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "0",
  marginTop: "30px",
  marginBottom: "30px",
  borderRadius: "8px",
  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
  maxWidth: "600px",
};

const header = {
  backgroundColor: "#2D5016", // Earth green
  padding: "30px 40px 20px",
  textAlign: "center" as const,
  borderRadius: "8px 8px 0 0",
};

const brandText = {
  color: "#ffffff",
  fontSize: "32px",
  fontWeight: "bold",
  margin: "0",
  letterSpacing: "-0.5px",
};

const tagline = {
  color: "#a7c957", // Light green
  fontSize: "14px",
  margin: "8px 0 0",
  fontWeight: "500",
};

const content = {
  padding: "40px",
};

const h1 = {
  color: "#2D5016",
  fontSize: "24px",
  fontWeight: "600",
  margin: "0 0 24px",
  textAlign: "center" as const,
};

const text = {
  color: "#374151",
  fontSize: "16px",
  lineHeight: "24px",
  margin: "16px 0",
};

const smallText = {
  color: "#6b7280",
  fontSize: "14px",
  lineHeight: "20px",
  margin: "16px 0",
};

const buttonContainer = {
  textAlign: "center" as const,
  margin: "32px 0",
};

const button = {
  backgroundColor: "#6a994e", // Primary green
  borderRadius: "6px",
  color: "#ffffff",
  fontSize: "16px",
  fontWeight: "600",
  textDecoration: "none",
  padding: "14px 28px",
  display: "inline-block",
  border: "none",
  cursor: "pointer",
};

const hr = {
  borderColor: "#e5e7eb",
  margin: "24px 0",
};

const otpContainer = {
  backgroundColor: "#f3f4f6",
  border: "2px dashed #d1d5db",
  borderRadius: "8px",
  padding: "16px",
  textAlign: "center" as const,
  margin: "16px 0",
};

const otpCode = {
  fontSize: "28px",
  fontWeight: "bold",
  letterSpacing: "6px",
  color: "#2D5016",
  margin: "0",
  fontFamily: "monospace",
};

const footer = {
  backgroundColor: "#f9fafb",
  padding: "30px 40px",
  textAlign: "center" as const,
  borderRadius: "0 0 8px 8px",
  borderTop: "1px solid #e5e7eb",
};

const footerText = {
  color: "#6b7280",
  fontSize: "14px",
  margin: "0 0 8px",
  lineHeight: "20px",
};

const footerSmall = {
  color: "#9ca3af",
  fontSize: "12px",
  margin: "0",
  lineHeight: "16px",
};