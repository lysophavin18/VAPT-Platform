import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  mfaCode: z.string().optional(),
  rememberDevice: z.boolean().optional(),
});

export const projectSchema = z.object({
  name: z.string().min(3, 'Project name is required'),
  description: z.string().optional(),
  owner: z.string().optional(),
  technicalOwner: z.string().optional(),
  environment: z.enum(['development', 'testing', 'staging', 'production']),
  tags: z.string().optional(),
});

export const discoverySchema = z.object({
  projectId: z.string().min(1, 'Choose a project'),
  target: z.string().min(3, 'Enter a domain, URL, IP, API, repository, or image'),
  targetType: z.string().min(1),
  passive: z.boolean().default(true),
  safeActive: z.boolean().default(true),
  technologyDetection: z.boolean().default(true),
  screenshots: z.boolean().default(false),
});
