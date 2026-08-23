'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Loader2, Plus, Search, Send, Trash2, UserRoundCog } from 'lucide-react'
import * as React from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { EmptyState } from '@/components/layout/empty-state'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '@/components/ui/table'
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '@/components/ui/tooltip'
import type { ActionResult } from '@/lib/action-result'
import { formatDate } from '@/lib/format'
import {
	getRenewalStatus,
	RENEWAL_STATUS_URGENCY_RANK,
} from '@/lib/staff-augmentation-status'
import {
	staffAugmentationAssignmentSchema,
	type StaffAugmentationAssignmentInput,
} from '@/lib/validation/staff-augmentation'
import {
	addStaffAugmentationAssignment,
	fetchStaffAugmentationEmployeeOptions,
	removeStaffAugmentationAssignment,
} from '@/server/staff-augmentation/actions'
import type { StaffAugmentationAssignmentRow } from '@/server/staff-augmentation/types'

import { StaffAugmentationProjectPicker } from './staff-augmentation-project-picker'
import { StaffAugmentationStatusBadge } from './staff-augmentation-status-badge'

type StaffAugmentationAssignmentsTableProps = {
	engagementId: string
	assignments: StaffAugmentationAssignmentRow[]
	canEdit: boolean
	canDelete: boolean
	/** Governs the Project cell's picker — it writes to the Employees module's deployment history, so it's gated on `employees:edit`, not `staff_augmentation:edit`. */
	canEditDeployment: boolean
}

type StatusSortOrder = 'none' | 'urgent-first' | 'urgent-last'

export function StaffAugmentationAssignmentsTable({
	engagementId,
	assignments,
	canEdit,
	canDelete,
	canEditDeployment,
}: StaffAugmentationAssignmentsTableProps) {
	const [adding, setAdding] = React.useState(false)
	const [removing, setRemoving] =
		React.useState<StaffAugmentationAssignmentRow | null>(null)
	const [selected, setSelected] = React.useState<Set<string>>(new Set())
	const [search, setSearch] = React.useState('')
	const [statusSort, setStatusSort] = React.useState<StatusSortOrder>('none')

	const validSelected = React.useMemo(() => {
		const ids = new Set(assignments.map((row) => row.id))
		return new Set([...selected].filter((id) => ids.has(id)))
	}, [assignments, selected])

	// Search and status sort only affect which rows are shown/in what order —
	// selection (above) tracks against the full `assignments` prop, so it
	// survives the user changing the search or sort afterward.
	const query = search.trim().toLowerCase()
	const searchedRows = query
		? assignments.filter((row) => row.employeeName.toLowerCase().includes(query))
		: assignments
	const visibleRows =
		statusSort === 'none'
			? searchedRows
			: [...searchedRows].sort((a, b) => {
					const diff =
						RENEWAL_STATUS_URGENCY_RANK[getRenewalStatus(a)] -
						RENEWAL_STATUS_URGENCY_RANK[getRenewalStatus(b)]
					return statusSort === 'urgent-first' ? diff : -diff
				})

	const visibleSelectedCount = visibleRows.filter((row) =>
		validSelected.has(row.id),
	).length
	const allSelected =
		visibleRows.length > 0 && visibleSelectedCount === visibleRows.length
	const someSelected = visibleSelectedCount > 0 && !allSelected

	const mutation = useMutation({
		mutationFn: async (task: () => Promise<ActionResult<unknown>>) => task(),
		onSuccess: (result) => {
			if (result.ok) {
				toast.success(result.message)
				setAdding(false)
				setRemoving(null)
			} else {
				toast.error(result.error)
			}
		},
		onError: () => toast.error('Something went wrong. Please try again.'),
	})

	function toggleRow(id: string, checked: boolean) {
		setSelected((prev) => {
			const next = new Set(prev)
			if (checked) next.add(id)
			else next.delete(id)
			return next
		})
	}

	function toggleAll(checked: boolean) {
		setSelected((prev) => {
			const next = new Set(prev)
			for (const row of visibleRows) {
				if (checked) next.add(row.id)
				else next.delete(row.id)
			}
			return next
		})
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Deployed as Staff Augmentation</CardTitle>
				<CardDescription>
					Level, project and dates are pulled live from each employee&apos;s
					current record in the Employee module.
				</CardDescription>
				<CardAction>
					{canEdit ? (
						<Button size="sm" onClick={() => setAdding(true)}>
							<Plus className="size-4" aria-hidden />
							Add employee
						</Button>
					) : null}
				</CardAction>
			</CardHeader>
			<CardContent>
				{assignments.length === 0 ? (
					<EmptyState
						icon={UserRoundCog}
						title="No one staffed yet"
						description={
							canEdit
								? 'Add the first employee to start tracking this engagement.'
								: 'Staffing records will appear here once one is added.'
						}
						action={
							canEdit ? (
								<Button size="sm" onClick={() => setAdding(true)}>
									<Plus className="size-4" aria-hidden />
									Add employee
								</Button>
							) : undefined
						}
					/>
				) : (
					<div className="space-y-3">
						<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
							<div className="relative w-full sm:max-w-xs">
								<Search
									className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
									aria-hidden
								/>
								<Input
									value={search}
									onChange={(event) => setSearch(event.target.value)}
									placeholder="Search employee name"
									aria-label="Search employee name"
									className="pl-9"
								/>
							</div>

							<Select
								value={statusSort}
								onValueChange={(value) => setStatusSort(value as StatusSortOrder)}
							>
								<SelectTrigger
									size="sm"
									className="w-full sm:w-56"
									aria-label="Sort by status"
								>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="none">Default order</SelectItem>
									<SelectItem value="urgent-first">
										Status: most urgent first
									</SelectItem>
									<SelectItem value="urgent-last">
										Status: least urgent first
									</SelectItem>
								</SelectContent>
							</Select>
						</div>

						{validSelected.size > 0 ? (
							<div className="bg-muted/50 flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
								<span className="font-medium">
									{validSelected.size} selected
								</span>
								<Tooltip>
									<TooltipTrigger asChild>
										<span className="inline-flex">
											<Button size="sm" variant="outline" disabled>
												<Send className="size-4" aria-hidden />
												Send renewal notification
											</Button>
										</span>
									</TooltipTrigger>
									<TooltipContent>
										Batch renewal notifications aren&apos;t wired up yet.
									</TooltipContent>
								</Tooltip>
							</div>
						) : null}

						{visibleRows.length === 0 ? (
							<p className="text-muted-foreground py-8 text-center text-sm">
								No employees match &quot;{search}&quot;.
							</p>
						) : (
						<div className="overflow-x-auto rounded-lg border">
							<Table>
								<TableHeader>
									<TableRow className="hover:bg-transparent">
										<TableHead className="w-10">
											<Checkbox
												checked={
													allSelected
														? true
														: someSelected
															? 'indeterminate'
															: false
												}
												onCheckedChange={(checked) =>
													toggleAll(checked === true)
												}
												aria-label="Select all"
											/>
										</TableHead>
										<TableHead>Employee name</TableHead>
										<TableHead>Level-Position</TableHead>
										<TableHead>Project name</TableHead>
										<TableHead>Start date</TableHead>
										<TableHead>End date</TableHead>
										<TableHead>Status</TableHead>
										{canDelete ? (
											<TableHead className="w-12" aria-label="Actions" />
										) : null}
									</TableRow>
								</TableHeader>
								<TableBody>
									{visibleRows.map((row) => {
										const status = getRenewalStatus(row)
										const levelPosition =
											[row.level, row.position].filter(Boolean).join(' - ') ||
											'—'

										return (
											<TableRow key={row.id}>
												<TableCell>
													<Checkbox
														checked={validSelected.has(row.id)}
														onCheckedChange={(checked) =>
															toggleRow(row.id, checked === true)
														}
														aria-label={`Select ${row.employeeName}`}
													/>
												</TableCell>
												<TableCell className="font-medium">
													{row.employeeName}
												</TableCell>
												<TableCell>{levelPosition}</TableCell>
												<TableCell>
													<StaffAugmentationProjectPicker
														employeeId={row.employeeId}
														employeeName={row.employeeName}
														currentProjectName={row.projectName}
														canEdit={canEditDeployment}
													/>
												</TableCell>
												<TableCell className="whitespace-nowrap">
													{formatDate(row.startDate)}
												</TableCell>
												<TableCell className="whitespace-nowrap">
													{formatDate(row.endDate)}
												</TableCell>
												<TableCell>
													<StaffAugmentationStatusBadge status={status} />
												</TableCell>
												{canDelete ? (
													<TableCell>
														<Button
															variant="ghost"
															size="icon"
															disabled={mutation.isPending}
															aria-label={`Remove ${row.employeeName}`}
															onClick={() => setRemoving(row)}
														>
															<Trash2 className="size-4" aria-hidden />
														</Button>
													</TableCell>
												) : null}
											</TableRow>
										)
									})}
								</TableBody>
							</Table>
						</div>
						)}
					</div>
				)}
			</CardContent>

			<AddAssignmentDialog
				open={adding}
				engagementId={engagementId}
				pending={mutation.isPending}
				onOpenChange={setAdding}
				onSubmit={(values) => {
					mutation.mutate(() =>
						addStaffAugmentationAssignment({ engagementId, ...values }),
					)
				}}
			/>

			<AlertDialog
				open={Boolean(removing)}
				onOpenChange={(open) => !open && setRemoving(null)}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Remove this employee?</AlertDialogTitle>
						<AlertDialogDescription>
							{removing ? (
								<>
									<span className="text-foreground font-medium">
										{removing.employeeName}
									</span>{' '}
									will no longer be staffed on this engagement.
								</>
							) : null}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={mutation.isPending}>
							Cancel
						</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
							disabled={mutation.isPending}
							onClick={(event) => {
								event.preventDefault()
								if (!removing) return
								mutation.mutate(() =>
									removeStaffAugmentationAssignment({
										id: removing.id,
										engagementId,
									}),
								)
							}}
						>
							Remove
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</Card>
	)
}

type AddAssignmentDialogProps = {
	open: boolean
	engagementId: string
	pending: boolean
	onOpenChange: (open: boolean) => void
	onSubmit: (values: StaffAugmentationAssignmentInput) => void
}

function AddAssignmentDialog({
	open,
	engagementId,
	pending,
	onOpenChange,
	onSubmit,
}: AddAssignmentDialogProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				{open ? (
					<AddAssignmentForm
						engagementId={engagementId}
						pending={pending}
						onOpenChange={onOpenChange}
						onSubmit={onSubmit}
					/>
				) : null}
			</DialogContent>
		</Dialog>
	)
}

function AddAssignmentForm({
	engagementId,
	pending,
	onOpenChange,
	onSubmit,
}: {
	engagementId: string
	pending: boolean
	onOpenChange: (open: boolean) => void
	onSubmit: (values: StaffAugmentationAssignmentInput) => void
}) {
	const employeeOptions = useQuery({
		queryKey: ['staff-augmentation-employee-options', engagementId],
		queryFn: () => fetchStaffAugmentationEmployeeOptions(engagementId),
	})

	const form = useForm<StaffAugmentationAssignmentInput>({
		resolver: zodResolver(staffAugmentationAssignmentSchema),
		defaultValues: { employeeId: '' },
	})

	return (
		<>
			<DialogHeader>
				<DialogTitle>Add employee</DialogTitle>
				<DialogDescription>
					Their level, position, project and dates will show whatever is current
					in the Employee module.
				</DialogDescription>
			</DialogHeader>

			<Form {...form}>
				<form
					onSubmit={form.handleSubmit(onSubmit)}
					className="space-y-4"
					noValidate
				>
					<FormField
						control={form.control}
						name="employeeId"
						render={({ field }) => (
							<FormItem>
								<FormLabel>Employee</FormLabel>
								<Select
									value={field.value}
									onValueChange={field.onChange}
									disabled={pending}
								>
									<FormControl>
										<SelectTrigger className="w-full">
											<SelectValue placeholder="Select employee" />
										</SelectTrigger>
									</FormControl>
									<SelectContent>
										{employeeOptions.data?.map((option) => (
											<SelectItem key={option.id} value={option.id}>
												{option.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								<FormMessage />
							</FormItem>
						)}
					/>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => onOpenChange(false)}
							disabled={pending}
						>
							Cancel
						</Button>
						<Button type="submit" disabled={pending}>
							{pending ? (
								<Loader2 className="size-4 animate-spin" aria-hidden />
							) : null}
							Add employee
						</Button>
					</DialogFooter>
				</form>
			</Form>
		</>
	)
}
