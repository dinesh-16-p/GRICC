import { z } from 'zod';

export const loginSchema = z.object({
  identifier: z.string().optional(),
  username: z.string().optional(),
  email: z.string().optional(),
  password: z.string().min(1, 'Password is required').max(128),
}).refine((data) => Boolean((data.identifier && data.identifier.trim()) || (data.username && data.username.trim()) || (data.email && data.email.trim())), {
  message: 'Identifier (username or email) is required',
  path: ['identifier'],
}).transform((data) => ({
  identifier: (data.identifier || data.username || data.email).trim(),
  password: data.password,
}));

export const createIncidentSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(200, 'Title cannot exceed 200 characters'),
  country: z.string().min(2, 'Country is required').max(100),
  region: z.string().optional(),
  category: z.string().min(2, 'Category is required').max(100),
  severity: z.enum(['Critical', 'High', 'Medium', 'Low'], {
    errorMap: () => ({ message: 'Severity must be Critical, High, Medium, or Low' }),
  }),
  status: z.enum(['Active', 'Investigating', 'Monitoring', 'Resolved', 'Closed']).optional().default('Active'),
  description: z.string().min(5, 'Description must be at least 5 characters').max(5000),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  coordinates: z.object({
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
  }).optional(),
  threatActor: z.string().max(150).optional(),
  verified: z.boolean().optional().default(false),
  source: z.string().max(150).optional().default('Manual Entry'),
});

export const updateIncidentSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  country: z.string().min(2).max(100).optional(),
  region: z.string().optional(),
  category: z.string().min(2).max(100).optional(),
  severity: z.enum(['Critical', 'High', 'Medium', 'Low']).optional(),
  status: z.enum(['Active', 'Investigating', 'Monitoring', 'Resolved', 'Closed']).optional(),
  description: z.string().min(5).max(5000).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  threatActor: z.string().max(150).optional(),
  verified: z.boolean().optional(),
  source: z.string().max(150).optional(),
});

export const aiChatSchema = z.object({
  message: z.string().min(1, 'Message text is required').max(4000, 'Message cannot exceed 4000 characters'),
  conversationId: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
});

export const aiGenerateReportSchema = z.object({
  title: z.string().min(3, 'Report title must be at least 3 characters').max(200),
  country: z.string().optional(),
  reportType: z.string().min(1, 'Report type is required'),
  countries: z.array(z.string()).optional(),
  notes: z.string().max(2000).optional(),
});

export const collaborationDiscussionSchema = z.object({
  title: z.string().min(3, 'Discussion title must be at least 3 characters').max(200),
  description: z.string().min(3, 'Description must be at least 3 characters').max(5000),
  discussionType: z.string().optional().default('GENERAL_INTELLIGENCE'),
  countryId: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional().default('MEDIUM'),
  visibility: z.enum(['TEAM', 'PRIVATE']).optional().default('TEAM'),
  tags: z.array(z.string()).optional(),
});

export const collaborationTaskSchema = z.object({
  title: z.string().min(3, 'Task title must be at least 3 characters').max(200),
  description: z.string().max(2000).optional(),
  assignedTo: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional().default('MEDIUM'),
  dueDate: z.string().optional(),
});
