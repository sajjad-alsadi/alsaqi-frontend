import { Request } from 'express';
import { User } from '../types';
import { UploadedFile } from 'express-fileupload';

export interface AuthenticatedRequest extends Request {
  user: User;
}

export interface FileUploadRequest extends AuthenticatedRequest {
  files?: {
    [key: string]: UploadedFile | UploadedFile[];
  };
}

export type OperationType = 'create' | 'update' | 'delete' | 'list' | 'get' | 'write';

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string;
    providerInfo: {
      providerId: string;
      displayName: string;
      email: string;
      photoUrl: string;
    }[];
  }
}
