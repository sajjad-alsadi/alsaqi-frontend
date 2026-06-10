// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFileUploadValidation } from '../useFileUploadValidation';

// Mock react-hot-toast
vi.mock('react-hot-toast', () => ({
  default: {
    error: vi.fn(),
  },
}));

import toast from 'react-hot-toast';

// Mock react-i18next
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      // Return key with interpolated params for testing
      if (params) {
        let result = key;
        for (const [k, v] of Object.entries(params)) {
          result += ` ${k}=${v}`;
        }
        return result;
      }
      return key;
    },
  }),
}));

// Mock the file upload validator
vi.mock('../../utils/fileUploadValidator', () => ({
  validateFiles: vi.fn(),
}));

import { validateFiles } from '../../utils/fileUploadValidator';

function createMockFile(name: string, size: number, type: string): File {
  const content = new Uint8Array(size);
  return new File([content], name, { type });
}

describe('useFileUploadValidation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validateAndFilter', () => {
    it('should return valid files and filter out invalid ones', async () => {
      const validFile = createMockFile('doc.pdf', 1024, 'application/pdf');
      const invalidFile = createMockFile('large.pdf', 20 * 1024 * 1024, 'application/pdf');

      vi.mocked(validateFiles).mockResolvedValue([
        { file: validFile, valid: true, errors: [] },
        {
          file: invalidFile,
          valid: false,
          errors: [
            {
              code: 'FILE_TOO_LARGE',
              message: 'File too large',
              details: { maxSize: 10485760, actualSize: 20971520, maxSizeFormatted: '10.0 MB', actualSizeFormatted: '20.0 MB' },
            },
          ],
        },
      ]);

      const { result } = renderHook(() => useFileUploadValidation());

      let validFiles: File[] = [];
      await act(async () => {
        validFiles = await result.current.validateAndFilter([validFile, invalidFile]);
      });

      expect(validFiles).toHaveLength(1);
      expect(validFiles[0]).toBe(validFile);
    });

    it('should show toast error for invalid files', async () => {
      const invalidFile = createMockFile('large.pdf', 20 * 1024 * 1024, 'application/pdf');

      vi.mocked(validateFiles).mockResolvedValue([
        {
          file: invalidFile,
          valid: false,
          errors: [
            {
              code: 'FILE_TOO_LARGE',
              message: 'File too large',
              details: { maxSize: 10485760, actualSize: 20971520 },
            },
          ],
        },
      ]);

      const { result } = renderHook(() => useFileUploadValidation());

      await act(async () => {
        await result.current.validateAndFilter([invalidFile]);
      });

      expect(toast.error).toHaveBeenCalledTimes(1);
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining('large.pdf'),
        expect.any(Object),
      );
    });

    it('should not show toast when showToast option is false', async () => {
      const invalidFile = createMockFile('large.pdf', 20 * 1024 * 1024, 'application/pdf');

      vi.mocked(validateFiles).mockResolvedValue([
        {
          file: invalidFile,
          valid: false,
          errors: [
            {
              code: 'FILE_TOO_LARGE',
              message: 'File too large',
              details: { maxSize: 10485760, actualSize: 20971520 },
            },
          ],
        },
      ]);

      const { result } = renderHook(() =>
        useFileUploadValidation({ showToast: false }),
      );

      await act(async () => {
        await result.current.validateAndFilter([invalidFile]);
      });

      expect(toast.error).not.toHaveBeenCalled();
    });

    it('should return empty array for empty input', async () => {
      const { result } = renderHook(() => useFileUploadValidation());

      let validFiles: File[] = [];
      await act(async () => {
        validFiles = await result.current.validateAndFilter([]);
      });

      expect(validFiles).toHaveLength(0);
      expect(validateFiles).not.toHaveBeenCalled();
    });

    it('should pass configured options to validateFiles', async () => {
      const file = createMockFile('doc.pdf', 1024, 'application/pdf');

      vi.mocked(validateFiles).mockResolvedValue([
        { file, valid: true, errors: [] },
      ]);

      const { result } = renderHook(() =>
        useFileUploadValidation({
          maxSizeBytes: 5 * 1024 * 1024,
          allowedExtensions: ['.pdf'],
          allowedMimeTypes: ['application/pdf'],
        }),
      );

      await act(async () => {
        await result.current.validateAndFilter([file]);
      });

      expect(validateFiles).toHaveBeenCalledWith([file], {
        maxSizeBytes: 5 * 1024 * 1024,
        allowedExtensions: ['.pdf'],
        allowedMimeTypes: ['application/pdf'],
      });
    });

    it('should update errors state with all validation errors', async () => {
      const file1 = createMockFile('large.pdf', 20 * 1024 * 1024, 'application/pdf');
      const file2 = createMockFile('evil.exe', 1024, 'application/x-msdownload');

      vi.mocked(validateFiles).mockResolvedValue([
        {
          file: file1,
          valid: false,
          errors: [
            { code: 'FILE_TOO_LARGE', message: 'Too large', details: { maxSize: 10485760, actualSize: 20971520 } },
          ],
        },
        {
          file: file2,
          valid: false,
          errors: [
            { code: 'DISALLOWED_EXTENSION', message: 'Bad ext', details: { allowedExtensions: ['.pdf'] } },
            { code: 'DISALLOWED_MIME_TYPE', message: 'Bad mime', details: { allowedMimeTypes: ['application/pdf'] } },
          ],
        },
      ]);

      const { result } = renderHook(() => useFileUploadValidation());

      await act(async () => {
        await result.current.validateAndFilter([file1, file2]);
      });

      expect(result.current.errors).toHaveLength(3);
      expect(result.current.errors[0]!.code).toBe('FILE_TOO_LARGE');
      expect(result.current.errors[1]!.code).toBe('DISALLOWED_EXTENSION');
      expect(result.current.errors[2]!.code).toBe('DISALLOWED_MIME_TYPE');
    });
  });

  describe('getErrorMessage', () => {
    it('should return localized message for FILE_TOO_LARGE', () => {
      const { result } = renderHook(() => useFileUploadValidation());

      const msg = result.current.getErrorMessage({
        code: 'FILE_TOO_LARGE',
        message: 'too large',
        details: { maxSize: 10485760, actualSize: 20971520 },
      });

      expect(msg).toContain('fileUpload.errors.fileTooLarge');
      expect(msg).toContain('maxSize=');
      expect(msg).toContain('actualSize=');
    });

    it('should return localized message for DISALLOWED_EXTENSION', () => {
      const { result } = renderHook(() => useFileUploadValidation());

      const msg = result.current.getErrorMessage({
        code: 'DISALLOWED_EXTENSION',
        message: 'not allowed',
        details: { allowedExtensions: ['.pdf', '.docx'] },
      });

      expect(msg).toContain('fileUpload.errors.disallowedType');
      expect(msg).toContain('.pdf, .docx');
    });

    it('should return localized message for MIME_EXTENSION_MISMATCH', () => {
      const { result } = renderHook(() => useFileUploadValidation());

      const msg = result.current.getErrorMessage({
        code: 'MIME_EXTENSION_MISMATCH',
        message: 'mismatch',
        details: {},
      });

      expect(msg).toContain('fileUpload.errors.mimeExtensionMismatch');
    });
  });

  describe('clearErrors', () => {
    it('should clear stored errors and results', async () => {
      const invalidFile = createMockFile('large.pdf', 20 * 1024 * 1024, 'application/pdf');

      vi.mocked(validateFiles).mockResolvedValue([
        {
          file: invalidFile,
          valid: false,
          errors: [
            { code: 'FILE_TOO_LARGE', message: 'Too large', details: { maxSize: 10485760, actualSize: 20971520 } },
          ],
        },
      ]);

      const { result } = renderHook(() => useFileUploadValidation());

      await act(async () => {
        await result.current.validateAndFilter([invalidFile]);
      });

      expect(result.current.errors).toHaveLength(1);
      expect(result.current.results).toHaveLength(1);

      act(() => {
        result.current.clearErrors();
      });

      expect(result.current.errors).toHaveLength(0);
      expect(result.current.results).toHaveLength(0);
    });
  });
});
