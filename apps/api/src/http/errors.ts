import type { ApiErrorCode, ErrorResponse } from '@asterbyte/contracts';
import type { ErrorRequestHandler, Response } from 'express';
import type { Logger } from 'pino';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const errorBody = (
  response: Response,
  code: ApiErrorCode,
  message: string,
): ErrorResponse => {
  const requestId = response.getHeader('X-Request-ID');

  if (typeof requestId !== 'string') {
    throw new Error('Request context must be installed before HTTP handlers.');
  }

  return { error: { code, message, requestId } };
};

const classifyError = (error: unknown): HttpError => {
  if (error instanceof HttpError) return error;

  if (typeof error === 'object' && error !== null && 'type' in error) {
    if (error.type === 'entity.parse.failed') {
      return new HttpError(400, 'INVALID_JSON', 'The request body must contain valid JSON.');
    }
    if (error.type === 'entity.too.large') {
      return new HttpError(413, 'PAYLOAD_TOO_LARGE', 'The request body exceeds the size limit.');
    }
    if (error.type === 'charset.unsupported' || error.type === 'encoding.unsupported') {
      return new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'The request encoding is not supported.');
    }
  }

  return new HttpError(500, 'INTERNAL_ERROR', 'The request could not be completed.');
};

export const createErrorHandler = (logger: Logger): ErrorRequestHandler => {
  return (error: unknown, _request, response, next) => {
    if (response.headersSent) {
      next(error);
      return;
    }

    const failure = classifyError(error);
    if (failure.status >= 500) {
      logger.error(
        {
          event: 'request_failed',
          requestId: response.getHeader('X-Request-ID'),
          errorType: error instanceof Error ? error.name : 'UnknownError',
        },
        'Unexpected request failure; request content and raw error text omitted.',
      );
    }

    response.status(failure.status).json(errorBody(response, failure.code, failure.message));
  };
};
