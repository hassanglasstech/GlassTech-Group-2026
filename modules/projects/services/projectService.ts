import { Project } from '../../shared/types';
import { safeParse } from '../../shared/services/utils';

const KEYS = {
  PROJECTS: 'gtk_erp_projects',
};

export const ProjectService = {
  getProjects: (): Project[] => safeParse(KEYS.PROJECTS),
  saveProjects: (data: Project[]) => localStorage.setItem(KEYS.PROJECTS, JSON.stringify(data)),
};
