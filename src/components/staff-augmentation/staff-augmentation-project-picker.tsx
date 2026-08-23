'use client'

import { useMutation, useQuery } from '@tanstack/react-query'
import { Loader2, Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from '@/components/ui/popover'
import { useDebounced } from '@/hooks/use-debounced'
import { formatDate } from '@/lib/format'
import {
	addDeploymentRecord,
	searchProjectsForDeployment,
} from '@/server/employees/actions'
import type { ProjectSearchOption } from '@/server/projects/types'

type StaffAugmentationProjectPickerProps = {
	employeeId: string
	employeeName: string
	currentProjectName: string | null
	canEdit: boolean
}

/**
 * The Project cell's editable control — picks a Project by name or S3P
 * number, then confirms adding it as a new record in that employee's
 * Deployment history (Employees module). This is a shortcut UI on top of
 * the existing `addDeploymentRecord` action, not a separate write path.
 */
export function StaffAugmentationProjectPicker({
	employeeId,
	employeeName,
	currentProjectName,
	canEdit,
}: StaffAugmentationProjectPickerProps) {
	const router = useRouter()
	const [pickerOpen, setPickerOpen] = React.useState(false)
	const [search, setSearch] = React.useState('')
	const debouncedSearch = useDebounced(search)

	const [selectedProject, setSelectedProject] =
		React.useState<ProjectSearchOption | null>(null)
	const [startDate, setStartDate] = React.useState('')
	const [endDate, setEndDate] = React.useState('')

	const projectOptions = useQuery({
		queryKey: ['staff-augmentation-project-search', debouncedSearch],
		queryFn: () => searchProjectsForDeployment(debouncedSearch),
		enabled: pickerOpen,
	})

	const mutation = useMutation({
		mutationFn: () =>
			addDeploymentRecord({
				employeeId,
				clientId: selectedProject!.clientId,
				projectId: selectedProject!.id,
				startDate,
				endDate,
			}),
		onSuccess: (result) => {
			if (result.ok) {
				toast.success(result.message)
				setSelectedProject(null)
				router.refresh()
			} else {
				toast.error(result.error)
			}
		},
		onError: () => toast.error('Something went wrong. Please try again.'),
	})

	function selectProject(project: ProjectSearchOption) {
		setSelectedProject(project)
		setStartDate(project.startDate ?? '')
		setEndDate(project.endDate ?? '')
		setPickerOpen(false)
		setSearch('')
	}

	if (!canEdit) {
		return <>{currentProjectName ?? '—'}</>
	}

	return (
		<>
			<Popover open={pickerOpen} onOpenChange={setPickerOpen}>
				<PopoverTrigger asChild>
					<button
						type="button"
						className="hover:bg-accent/50 -mx-2 rounded-md px-2 py-1 text-left transition-colors"
					>
						{currentProjectName ?? (
							<span className="text-muted-foreground cursor-pointer">
								Assign a project…
							</span>
						)}
					</button>
				</PopoverTrigger>
				<PopoverContent className="w-96 p-0" align="start">
					<div className="border-b p-2">
						<div className="relative">
							<Search
								className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2"
								aria-hidden
							/>
							<Input
								autoFocus
								placeholder="Search by project name or S3P number"
								value={search}
								onChange={(event) => setSearch(event.target.value)}
								className="h-8 pl-8"
							/>
						</div>
					</div>
					<div className="max-h-72 overflow-y-auto p-1">
						{projectOptions.isLoading ? (
							<p className="text-muted-foreground p-3 text-sm">Loading…</p>
						) : projectOptions.data?.length ? (
							projectOptions.data.map((project) => (
								<button
									key={project.id}
									type="button"
									onClick={() => selectProject(project)}
									className="hover:bg-accent/60 flex w-full flex-col gap-0.5 rounded-md px-2.5 py-2 text-left transition-colors"
								>
									<span className="flex items-center justify-between gap-2">
										<span className="truncate text-sm font-medium">
											{project.name}
										</span>
										<span className="text-muted-foreground shrink-0 font-mono text-xs">
											{project.s3pNumber}
										</span>
									</span>
									<span className="text-muted-foreground text-xs">
										{formatDate(project.startDate)} –{' '}
										{formatDate(project.endDate)}
									</span>
								</button>
							))
						) : (
							<p className="text-muted-foreground p-3 text-sm">
								{debouncedSearch
									? 'No matching projects.'
									: 'No projects found.'}
							</p>
						)}
					</div>
				</PopoverContent>
			</Popover>

			<Dialog
				open={Boolean(selectedProject)}
				onOpenChange={(open) => !open && setSelectedProject(null)}
			>
				<DialogContent className="sm:max-w-md">
					{selectedProject ? (
						<>
							<DialogHeader>
								<DialogTitle>Add this to Deployment History?</DialogTitle>
								<DialogDescription>
									This assigns{' '}
									<span className="text-foreground font-medium">
										{employeeName}
									</span>{' '}
									to{' '}
									<span className="text-foreground font-medium">
										{selectedProject.name}
									</span>{' '}
									({selectedProject.s3pNumber}) as a new record in their
									Deployment history.
								</DialogDescription>
							</DialogHeader>

							<div className="grid grid-cols-2 gap-4">
								<div className="space-y-2">
									<Label>Start date</Label>
									<DatePicker
										value={startDate}
										onChange={setStartDate}
										disabled={mutation.isPending}
									/>
								</div>
								<div className="space-y-2">
									<Label>End date</Label>
									<DatePicker
										value={endDate}
										onChange={setEndDate}
										disabled={mutation.isPending}
									/>
								</div>
							</div>

							<DialogFooter>
								<Button
									type="button"
									variant="outline"
									onClick={() => setSelectedProject(null)}
									disabled={mutation.isPending}
								>
									Cancel
								</Button>
								<Button
									type="button"
									disabled={mutation.isPending || !startDate || !endDate}
									onClick={() => mutation.mutate()}
								>
									{mutation.isPending ? (
										<Loader2 className="size-4 animate-spin" aria-hidden />
									) : null}
									Add to Deployment History
								</Button>
							</DialogFooter>
						</>
					) : null}
				</DialogContent>
			</Dialog>
		</>
	)
}
