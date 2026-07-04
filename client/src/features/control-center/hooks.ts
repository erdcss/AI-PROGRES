import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchControlCenterSummary,
  fetchControlCenterHealth,
  fetchImportJobs,
  createImportJob,
  approveImportJob,
  cancelImportJob,
  retryImportJob,
} from "./api";
import { controlCenterKeys } from "./query-keys";

export function useControlCenterSummary() {
  return useQuery({
    queryKey: controlCenterKeys.summary(),
    queryFn: fetchControlCenterSummary,
    refetchInterval: 15_000,
  });
}

export function useControlCenterHealth(enabled = true) {
  return useQuery({
    queryKey: controlCenterKeys.health(),
    queryFn: fetchControlCenterHealth,
    enabled,
    refetchInterval: 30_000,
  });
}

export function useImportJobs(page = 1, status?: string, enabled = true) {
  return useQuery({
    queryKey: controlCenterKeys.jobs(page, status),
    queryFn: () => fetchImportJobs(page, status),
    enabled,
    refetchInterval: 5_000,
  });
}

export function useCreateImportJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createImportJob,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: controlCenterKeys.all });
    },
  });
}

export function useApproveImportJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: approveImportJob,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: controlCenterKeys.all });
    },
  });
}

export function useCancelImportJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: cancelImportJob,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: controlCenterKeys.all });
    },
  });
}

export function useRetryImportJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: retryImportJob,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: controlCenterKeys.all });
    },
  });
}
