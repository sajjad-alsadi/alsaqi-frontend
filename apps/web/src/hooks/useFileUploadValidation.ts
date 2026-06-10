/**
 * File Upload Validation Hook
 *
 * Wraps the fileUploadValidator utility for use in React components.
 * Provides localized error messages via react-i18next and prevents
 * invalid files from being uploaded while allowing valid ones through.
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6
 */

import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  validateFiles,
  type ValidatorOptions,
  type ValidationResult,
  type ValidationError,
} from '../utils/fileUploadValidator';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FileUploadValidationOptions extends ValidatorOptions {
  /** Whether to show toast notifications for validation errors. Default: true */
  showToast?: boolean;
}

export interface FileUploadValidationResult {
  /** Whether validation is currently in progress (async magic bytes check) */
  isValidating: boolean;
  /** Latest validation errors (across all files from the last validation call) */
  errors: ValidationError[];
  /** Latest per-file validation results */
  results: ValidationResult[];
  /**
   * Validate files and return only the valid ones.
   * Displays localized error messages for invalid files.
   * Use this as a drop-in wrapper around file input onChange handlers.
   */
  validateAndFilter: (files: File[]) => Promise<File[]>;
  /**
   * Get a localized error message string for a validation error.
   */
  getErrorMessage: (error: ValidationError) => string;
  /** Clear all stored errors and results */
  clearErrors: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  const ONE_MB = 1024 * 1024;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < ONE_MB) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / ONE_MB).toFixed(1)} MB`;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useFileUploadValidation(
  options?: FileUploadValidationOptions,
): FileUploadValidationResult {
  const { t } = useTranslation();
  const [isValidating, setIsValidating] = useState(false);
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [results, setResults] = useState<ValidationResult[]>([]);

  const showToast = options?.showToast !== false;

  /**
   * Build a localized error message from a ValidationError.
   */
  const getErrorMessage = useCallback(
    (error: ValidationError): string => {
      switch (error.code) {
        case 'FILE_TOO_LARGE': {
          const maxSize = error.details?.['maxSize'] as number | undefined;
          const actualSize = error.details?.['actualSize'] as number | undefined;
          return t('fileUpload.errors.fileTooLarge', {
            maxSize: maxSize != null ? formatBytes(maxSize) : '',
            actualSize: actualSize != null ? formatBytes(actualSize) : '',
          });
        }
        case 'DISALLOWED_EXTENSION': {
          const allowedExtensions = error.details?.['allowedExtensions'] as string[] | undefined;
          return t('fileUpload.errors.disallowedType', {
            allowedTypes: allowedExtensions?.join(', ') ?? '',
          });
        }
        case 'DISALLOWED_MIME_TYPE': {
          const allowedMimeTypes = error.details?.['allowedMimeTypes'] as string[] | undefined;
          return t('fileUpload.errors.disallowedType', {
            allowedTypes: allowedMimeTypes?.join(', ') ?? '',
          });
        }
        case 'MIME_EXTENSION_MISMATCH': {
          return t('fileUpload.errors.mimeExtensionMismatch');
        }
        default:
          return error.message;
      }
    },
    [t],
  );

  /**
   * Validate files and return only valid ones.
   * Shows localized toast errors for each invalid file.
   */
  const validateAndFilter = useCallback(
    async (files: File[]): Promise<File[]> => {
      if (files.length === 0) return [];

      setIsValidating(true);
      setErrors([]);
      setResults([]);

      try {
        const validatorOpts: ValidatorOptions = {};
        if (options?.maxSizeBytes !== undefined) {
          validatorOpts.maxSizeBytes = options.maxSizeBytes;
        }
        if (options?.allowedExtensions !== undefined) {
          validatorOpts.allowedExtensions = options.allowedExtensions;
        }
        if (options?.allowedMimeTypes !== undefined) {
          validatorOpts.allowedMimeTypes = options.allowedMimeTypes;
        }
        const validationResults = await validateFiles(files, validatorOpts);

        setResults(validationResults);

        // Collect all errors from invalid files
        const allErrors: ValidationError[] = [];
        const invalidFiles: ValidationResult[] = [];

        for (const result of validationResults) {
          if (!result.valid) {
            allErrors.push(...result.errors);
            invalidFiles.push(result);
          }
        }

        setErrors(allErrors);

        // Show toast for each invalid file with its first error
        if (showToast && invalidFiles.length > 0) {
          for (const invalid of invalidFiles) {
            const firstError = invalid.errors[0];
            if (firstError) {
              const localizedMsg = getErrorMessage(firstError);
              toast.error(
                `${invalid.file.name}: ${localizedMsg}`,
                { duration: 5000 },
              );
            }
          }
        }

        // Return only valid files
        return validationResults
          .filter((r) => r.valid)
          .map((r) => r.file);
      } finally {
        setIsValidating(false);
      }
    },
    [options?.maxSizeBytes, options?.allowedExtensions, options?.allowedMimeTypes, showToast, getErrorMessage],
  );

  const clearErrors = useCallback(() => {
    setErrors([]);
    setResults([]);
  }, []);

  return {
    isValidating,
    errors,
    results,
    validateAndFilter,
    getErrorMessage,
    clearErrors,
  };
}

export default useFileUploadValidation;
