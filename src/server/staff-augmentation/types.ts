export type StaffAugmentationAssignmentRow = {
  id: string;
  employeeId: string;
  employeeName: string;
  level: string | null;
  position: string | null;
  projectName: string | null;
  startDate: string | null;
  endDate: string | null;
};

export type EmployeeOption = {
  id: string;
  name: string;
};
