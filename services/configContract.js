/**
 * Centralized Configuration Contract & Default Settings
 * Single source of truth for Discloner (frontend, backend, validation, presets, tests)
 */

export const DEFAULT_CONFIG = Object.freeze({
    // Core structural cloning
    cloneRoles: true,
    cloneChannels: true,
    clonePermissions: true,
    cloneProfile: true,

    // Message history & attachments (Explicitly OFF by default)
    cloneMessages: false,
    cloneAttachments: false,

    // Destructive cleanup (Default ON)
    cleanTarget: true,
    cleanupMode: 'full', // 'none' | 'managed' | 'matching' | 'full'

    // Message tuning defaults
    msgLimit: 15,
    msgDelay: 1000, // 1000ms default migration delay

    // Range constraints
    limits: Object.freeze({
        minMsgLimit: 1,
        maxMsgLimit: 100,
        defaultMsgLimit: 15,
        minMsgDelay: 200,
        maxMsgDelay: 5000,
        defaultMsgDelay: 1000
    }),

    // Safety policies
    mentionPolicy: 'sanitize', // 'sanitize' (neutralizes @everyone and @here) | 'allow'
    conflictPolicy: 'create' // 'create' | 'update' | 'skip'
});

export const CLEANUP_MODES = Object.freeze({
    NONE: 'none',
    MANAGED: 'managed',
    MATCHING: 'matching',
    FULL: 'full'
});

export const ERROR_CODES = Object.freeze({
    AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
    ACCESS_DENIED: 'ACCESS_DENIED',
    PERMISSION_DENIED: 'PERMISSION_DENIED',
    RATE_LIMITED: 'RATE_LIMITED',
    NETWORK_ERROR: 'NETWORK_ERROR',
    UNSUPPORTED_RESOURCE: 'UNSUPPORTED_RESOURCE',
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    CONFLICT: 'CONFLICT',
    CLEANUP_FAILURE: 'CLEANUP_FAILURE',
    CLONE_FAILURE: 'CLONE_FAILURE',
    VERIFICATION_FAILURE: 'VERIFICATION_FAILURE',
    CANCELLED: 'CANCELLED'
});

export const VERIFICATION_STATUSES = Object.freeze({
    VERIFIED: 'VERIFIED',
    VERIFIED_WITH_WARNINGS: 'VERIFIED_WITH_WARNINGS',
    PARTIAL: 'PARTIAL',
    FAILED: 'FAILED',
    CANCELLED: 'CANCELLED'
});
