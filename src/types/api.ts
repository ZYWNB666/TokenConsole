/**
 * Shared response envelope of the owned Business API. Success responses are
 * `{ data }`; failures are `{ error: { code, message, request_id } }` with a
 * matching HTTP status (see ../docs/API_CONTRACT.md).
 */
export type ApiErrorBody = {
  code: string;
  message: string;
  request_id: string;
};

export type ApiSuccess<TData> = { data: TData };

export type ApiFailure = { error: ApiErrorBody };

export type ApiResult<TData> = ApiSuccess<TData> | ApiFailure;

export function isApiFailure<TData>(result: ApiResult<TData>): result is ApiFailure {
  return "error" in result;
}
