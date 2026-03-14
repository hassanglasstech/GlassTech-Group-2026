import { Project } from '../../shared/types';
import { safeParse, safeSave } from '../../shared/services/utils';
import { toast } from 'sonner';

const KEYS = {
  PROJECTS: 'gtk_erp_projects',
};

export const ProjectService = {
  getProjects: (): Project[] => safeParse(KEYS.PROJECTS),
  saveProjects: (data: Project[]) => safeSave(KEYS.PROJECTS, data),
};
