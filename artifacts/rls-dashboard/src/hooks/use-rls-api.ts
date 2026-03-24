import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  useMakeCall,
  useAddToQueue,
  useStartQueue,
  usePauseQueue,
  useResumeQueue,
  useClearQueue,
  useAddTraining,
  useEnableSarah,
  useDisableSarah,
  useTestTexter,
  getGetQueueQueryKey,
  getGetStatsQueryKey,
  getGetTranscriptsQueryKey,
  getGetLearningsQueryKey,
  getGetTrainingQueryKey,
  getGetSarahStatusQueryKey,
  getGetLeadsQueryKey,
  getGetCallbacksQueryKey
} from "@workspace/api-client-react";

export function useRLSMutations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleSuccess = (message: string, invalidateKeys: any[][]) => {
    toast({ title: "Success", description: message, variant: "default" });
    invalidateKeys.forEach(key => queryClient.invalidateQueries({ queryKey: key }));
  };

  const handleError = (error: Error) => {
    toast({ title: "Error", description: error.message || "Operation failed", variant: "destructive" });
  };

  const makeCallMutation = useMakeCall({
    mutation: {
      onSuccess: () => handleSuccess("Call initiated successfully", [getGetStatsQueryKey(), getGetTranscriptsQueryKey()]),
      onError: handleError
    }
  });

  const addToQueueMutation = useAddToQueue({
    mutation: {
      onSuccess: (data) => handleSuccess(`Added ${data.added} leads to queue`, [getGetQueueQueryKey()]),
      onError: handleError
    }
  });

  const startQueueMutation = useStartQueue({
    mutation: {
      onSuccess: () => handleSuccess("Queue started", [getGetQueueQueryKey()]),
      onError: handleError
    }
  });

  const pauseQueueMutation = usePauseQueue({
    mutation: {
      onSuccess: () => handleSuccess("Queue paused", [getGetQueueQueryKey()]),
      onError: handleError
    }
  });

  const resumeQueueMutation = useResumeQueue({
    mutation: {
      onSuccess: () => handleSuccess("Queue resumed", [getGetQueueQueryKey()]),
      onError: handleError
    }
  });

  const clearQueueMutation = useClearQueue({
    mutation: {
      onSuccess: () => handleSuccess("Queue cleared", [getGetQueueQueryKey()]),
      onError: handleError
    }
  });

  const addTrainingMutation = useAddTraining({
    mutation: {
      onSuccess: (data) => handleSuccess(`Added video: ${data.title}`, [getGetTrainingQueryKey()]),
      onError: handleError
    }
  });

  const enableSarahMutation = useEnableSarah({
    mutation: {
      onSuccess: () => handleSuccess("Sarah AI Enabled", [getGetSarahStatusQueryKey()]),
      onError: handleError
    }
  });

  const disableSarahMutation = useDisableSarah({
    mutation: {
      onSuccess: () => handleSuccess("Sarah AI Disabled", [getGetSarahStatusQueryKey()]),
      onError: handleError
    }
  });

  const testTexterMutation = useTestTexter({
    mutation: {
      onSuccess: () => handleSuccess("Test texts sent", []),
      onError: handleError
    }
  });

  return {
    makeCall: makeCallMutation,
    addToQueue: addToQueueMutation,
    startQueue: startQueueMutation,
    pauseQueue: pauseQueueMutation,
    resumeQueue: resumeQueueMutation,
    clearQueue: clearQueueMutation,
    addTraining: addTrainingMutation,
    enableSarah: enableSarahMutation,
    disableSarah: disableSarahMutation,
    testTexter: testTexterMutation
  };
}
