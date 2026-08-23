export type OneLotProjectMemberRow = {
  id: string;
  userId: string;
  name: string;
  email: string;
  image: string | null;
  addedAt: Date;
};

export type UserOption = {
  id: string;
  name: string;
  email: string;
};

export type OneLotProjectS3pLinkRow = {
  id: string;
  projectId: string;
  s3pNumber: string;
  name: string;
  linkedAt: Date;
};
