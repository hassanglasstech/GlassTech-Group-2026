import { Company } from './core';

export interface ActivityLog { 
  id: string; 
  timestamp: string; 
  company: Company; 
  user: string; 
  module: string; 
  action: string; 
  description: string; 
  referenceId?: string; 
  amount?: number; 
}
