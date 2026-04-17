import React, { Component, ErrorInfo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import { palette } from '../theme/colors';
import { typography } from '../theme/typography';
import { spacing, borderRadius } from '../theme/spacing';

/* ─────────────────────────────────────────────────────────────────────────────
 * ErrorBoundary — catches render errors and displays a recovery UI.
 *
 * IMPORTANT: Error boundaries must be class components — React hooks cannot
 * catch errors in the render tree. getDerivedStateFromError + componentDidCatch
 * are the only mechanism.
 *
 * Usage:
 *   // Wrap individual screens in the navigator:
 *   <ErrorBoundary screenName="Home">
 *     <HomeScreen />
 *   </ErrorBoundary>
 *
 *   // Or wrap a section of a screen:
 *   <ErrorBoundary screenName="Workout Chart" compact>
 *     <LineChart data={data} />
 *   </ErrorBoundary>
 *
 * Props:
 *   screenName — displayed in the error UI so the user knows which module failed
 *   compact    — smaller inline error card instead of full-screen overlay
 *   onError    — optional callback for error logging/reporting
 *   fallback   — optional custom fallback component
 * ────────────────────────────────────────────────────────────────────────── */

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Name of the screen/section, shown in the error UI */
  screenName?: string;
  /** Render a compact inline error card instead of full-screen */
  compact?: boolean;
  /** Optional error callback for logging/telemetry */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Optional custom fallback component */
  fallback?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
  retryCount: number;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
      retryCount: 0,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });

    // Log to console in dev
    if (__DEV__) {
      console.error('[ErrorBoundary]', this.props.screenName || 'Unknown', error, errorInfo);
    }

    // External callback for error reporting
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleRetry = () => {
    this.setState((prev) => ({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
      retryCount: prev.retryCount + 1,
    }));
  };

  toggleDetails = () => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  /* ── Compact inline error card ────────────────────────────────────────── */
  renderCompact() {
    const { screenName } = this.props;
    const { error, retryCount } = this.state;
    const label = screenName ? `${screenName} Error` : 'Component Error';

    return (
      <View style={styles.compactContainer}>
        <View style={styles.compactInner}>
          {/* Error icon */}
          <Text style={styles.compactIcon}>⚠️</Text>

          {/* Error text */}
          <View style={styles.compactTextBlock}>
            <Text style={styles.compactTitle}>{label.toUpperCase()}</Text>
            <Text style={styles.compactMessage} numberOfLines={2}>
              {error?.message || 'An unexpected error occurred'}
            </Text>
          </View>

          {/* Retry button */}
          <TouchableOpacity
            style={styles.compactRetryBtn}
            onPress={this.handleRetry}
            activeOpacity={0.7}
          >
            <Text style={styles.compactRetryText}>RETRY</Text>
          </TouchableOpacity>
        </View>

        {retryCount >= 2 && (
          <Text style={styles.compactHint}>
            Tried {retryCount} times. This section may need the app to be restarted.
          </Text>
        )}
      </View>
    );
  }

  /* ── Full-screen error overlay ────────────────────────────────────────── */
  renderFullScreen() {
    const { screenName } = this.props;
    const { error, errorInfo, showDetails, retryCount } = this.state;
    const label = screenName || 'Screen';

    return (
      <View style={styles.fullContainer}>
        <ScrollView
          contentContainerStyle={styles.fullContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Large error icon */}
          <View style={styles.errorIconContainer}>
            <Text style={styles.errorIcon}>💥</Text>
          </View>

          {/* Title */}
          <Text style={styles.fullTitle}>SOMETHING WENT WRONG</Text>

          {/* Module name */}
          <View style={styles.moduleBadge}>
            <Text style={styles.moduleBadgeText}>{label.toUpperCase()}</Text>
          </View>

          {/* Error message */}
          <Text style={styles.fullMessage}>
            {error?.message || 'An unexpected error occurred in this module.'}
          </Text>

          {/* Retry info */}
          {retryCount > 0 && (
            <Text style={styles.retryInfo}>
              Retry attempt {retryCount} of 3
            </Text>
          )}

          {/* Primary action: Retry */}
          <TouchableOpacity
            style={[
              styles.retryButton,
              retryCount >= 3 && styles.retryButtonDisabled,
            ]}
            onPress={this.handleRetry}
            activeOpacity={0.7}
            disabled={retryCount >= 3}
          >
            <Text style={styles.retryButtonText}>
              {retryCount >= 3 ? 'MAX RETRIES REACHED' : 'TRY AGAIN'}
            </Text>
          </TouchableOpacity>

          {/* Max retries hint */}
          {retryCount >= 3 && (
            <Text style={styles.maxRetryHint}>
              Please restart the app or contact support if this persists.
            </Text>
          )}

          {/* Toggle error details */}
          <TouchableOpacity
            style={styles.detailsToggle}
            onPress={this.toggleDetails}
            activeOpacity={0.7}
          >
            <Text style={styles.detailsToggleText}>
              {showDetails ? 'HIDE DETAILS ▲' : 'SHOW DETAILS ▼'}
            </Text>
          </TouchableOpacity>

          {/* Error details panel */}
          {showDetails && (
            <View style={styles.detailsPanel}>
              {/* Error name */}
              <Text style={styles.detailLabel}>ERROR TYPE</Text>
              <Text style={styles.detailValue}>{error?.name || 'Error'}</Text>

              {/* Error message */}
              <Text style={styles.detailLabel}>MESSAGE</Text>
              <Text style={styles.detailValue}>{error?.message || 'Unknown'}</Text>

              {/* Stack trace (truncated) */}
              {error?.stack && (
                <>
                  <Text style={styles.detailLabel}>STACK TRACE</Text>
                  <ScrollView
                    style={styles.stackScroll}
                    nestedScrollEnabled
                    showsVerticalScrollIndicator
                  >
                    <Text style={styles.stackText}>
                      {formatStack(error.stack)}
                    </Text>
                  </ScrollView>
                </>
              )}

              {/* Component stack */}
              {errorInfo?.componentStack && (
                <>
                  <Text style={styles.detailLabel}>COMPONENT STACK</Text>
                  <ScrollView
                    style={styles.stackScroll}
                    nestedScrollEnabled
                    showsVerticalScrollIndicator
                  >
                    <Text style={styles.stackText}>
                      {errorInfo.componentStack.trim()}
                    </Text>
                  </ScrollView>
                </>
              )}

              {/* Environment info */}
              <Text style={styles.detailLabel}>ENVIRONMENT</Text>
              <Text style={styles.detailValue}>
                Platform: {Platform.OS} | DEV: {__DEV__ ? 'true' : 'false'}
              </Text>
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  render() {
    if (this.state.hasError) {
      // Custom fallback takes priority
      if (this.props.fallback) {
        return <>{this.props.fallback}</>;
      }

      if (this.props.compact) {
        return this.renderCompact();
      }

      return this.renderFullScreen();
    }

    return this.props.children;
  }
}

/* ─── Helper ──────────────────────────────────────────────────────────────── */

/** Cleans up a stack trace for display — keeps first 15 frames max */
function formatStack(stack: string): string {
  const lines = stack.split('\n');
  const truncated = lines.slice(0, 15);
  if (lines.length > 15) {
    truncated.push(`... and ${lines.length - 15} more frames`);
  }
  return truncated.join('\n');
}

/* ─── Styles ──────────────────────────────────────────────────────────────── */

// Using hardcoded dark palette values here because ErrorBoundary cannot use
// useTheme() hook (it's a class component). This matches the dark theme which
// is the primary theme for Zenki Dojo.

const styles = StyleSheet.create({
  /* ── Full-screen variant ───────────────────────────────────────────── */
  fullContainer: {
    flex: 1,
    backgroundColor: palette.grey950,
  },
  fullContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  errorIconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  errorIcon: {
    fontSize: 48,
  },
  fullTitle: {
    ...typography.sectionTitle,
    color: palette.grey50,
    textAlign: 'center',
    marginBottom: spacing.smd,
  },
  moduleBadge: {
    paddingHorizontal: spacing.smd,
    paddingVertical: spacing.xs,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderRadius: borderRadius.sm,
    marginBottom: spacing.md,
  },
  moduleBadgeText: {
    ...typography.label,
    color: palette.error,
    letterSpacing: 1.2,
  },
  fullMessage: {
    ...typography.body,
    color: palette.grey400,
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 22,
    marginBottom: spacing.lg,
  },
  retryInfo: {
    ...typography.caption,
    color: palette.grey500,
    marginBottom: spacing.md,
  },
  retryButton: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.smd,
    backgroundColor: palette.gold,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
    minWidth: 200,
    alignItems: 'center',
  },
  retryButtonDisabled: {
    backgroundColor: palette.grey700,
    opacity: 0.5,
  },
  retryButtonText: {
    ...typography.button,
    color: palette.black,
    fontWeight: '700',
  },
  maxRetryHint: {
    ...typography.bodySmall,
    color: palette.error,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  detailsToggle: {
    paddingVertical: spacing.sm,
    marginTop: spacing.sm,
  },
  detailsToggleText: {
    ...typography.caption,
    color: palette.grey500,
    letterSpacing: 0.8,
  },
  detailsPanel: {
    width: '100%',
    marginTop: spacing.md,
    padding: spacing.md,
    backgroundColor: palette.grey900,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  detailLabel: {
    ...typography.label,
    color: palette.grey500,
    marginTop: spacing.smd,
    marginBottom: spacing.xxs,
  },
  detailValue: {
    ...typography.bodySmall,
    color: palette.grey300,
    lineHeight: 20,
  },
  stackScroll: {
    maxHeight: 160,
    backgroundColor: palette.black,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    marginTop: spacing.xxs,
  },
  stackText: {
    fontFamily: Platform.OS === 'web' ? 'monospace' : 'Courier',
    fontSize: 10,
    lineHeight: 16,
    color: palette.grey400,
  },

  /* ── Compact inline variant ────────────────────────────────────────── */
  compactContainer: {
    marginHorizontal: spacing.md,
    marginVertical: spacing.sm,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    overflow: 'hidden',
  },
  compactInner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.smd,
    gap: spacing.smd,
  },
  compactIcon: {
    fontSize: 24,
  },
  compactTextBlock: {
    flex: 1,
  },
  compactTitle: {
    ...typography.label,
    color: palette.error,
    letterSpacing: 0.8,
    textAlign: 'left',
  },
  compactMessage: {
    ...typography.caption,
    color: palette.grey400,
    textAlign: 'left',
    marginTop: 2,
  },
  compactRetryBtn: {
    paddingHorizontal: spacing.smd,
    paddingVertical: spacing.sm,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderRadius: borderRadius.sm,
  },
  compactRetryText: {
    ...typography.label,
    color: palette.error,
    fontSize: 10,
    letterSpacing: 1,
  },
  compactHint: {
    ...typography.caption,
    color: palette.grey500,
    textAlign: 'center',
    paddingHorizontal: spacing.smd,
    paddingBottom: spacing.sm,
    fontSize: 10,
  },
});
