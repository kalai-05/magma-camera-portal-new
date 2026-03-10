package com.magma.cameraportal.controller;

import org.apache.hc.client5.http.auth.AuthScope;
import org.apache.hc.client5.http.auth.UsernamePasswordCredentials;
import org.apache.hc.client5.http.impl.auth.BasicCredentialsProvider;
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient;
import org.apache.hc.client5.http.impl.classic.HttpClients;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.http.client.HttpComponentsClientHttpRequestFactory;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

import jakarta.servlet.http.HttpServletRequest;
import java.util.Enumeration;

@RestController
@CrossOrigin(origins = "*", allowedHeaders = "*")
@RequestMapping("/api")
public class ProxyController {

    private final RestTemplate restTemplate;
    private final String targetBaseUrl = "http://185.252.234.120";

    public ProxyController() {
        BasicCredentialsProvider credentialsProvider = new BasicCredentialsProvider();
        credentialsProvider.setCredentials(
            new AuthScope("185.252.234.120", 80),
            new UsernamePasswordCredentials("admin", "Samitha@0509".toCharArray())
        );

        CloseableHttpClient httpClient = HttpClients.custom()
            .setDefaultCredentialsProvider(credentialsProvider)
            .build();

        HttpComponentsClientHttpRequestFactory requestFactory = new HttpComponentsClientHttpRequestFactory(httpClient);
        this.restTemplate = new RestTemplate(requestFactory);
        this.restTemplate.setErrorHandler(new org.springframework.web.client.ResponseErrorHandler() {
            @Override
            public boolean hasError(org.springframework.http.client.ClientHttpResponse response) {
                return false; // means we don't consider any status as exception, we just return it
            }
            @Override
            public void handleError(org.springframework.http.client.ClientHttpResponse response) {
            }
        });
    }

    @RequestMapping(value = "/**", method = {RequestMethod.GET, RequestMethod.POST, RequestMethod.PUT, RequestMethod.DELETE})
    public ResponseEntity<byte[]> proxy(HttpServletRequest request, @RequestBody(required = false) byte[] body) {
        String path = request.getRequestURI().replaceFirst("/api", "");
        String query = request.getQueryString();
        String url = targetBaseUrl + path + (query != null ? "?" + query : "");

        HttpMethod method = HttpMethod.valueOf(request.getMethod());

        HttpHeaders headers = new HttpHeaders();
        Enumeration<String> headerNames = request.getHeaderNames();
        while (headerNames.hasMoreElements()) {
            String headerName = headerNames.nextElement();
            if (!headerName.equalsIgnoreCase(HttpHeaders.HOST) && 
                !headerName.equalsIgnoreCase(HttpHeaders.AUTHORIZATION) &&
                !headerName.equalsIgnoreCase(HttpHeaders.CONTENT_LENGTH)) {
                headers.add(headerName, request.getHeader(headerName));
            }
        }

        HttpEntity<byte[]> httpEntity = new HttpEntity<>(body, headers);

        try {
            return restTemplate.exchange(url, method, httpEntity, byte[].class);
        } catch (org.springframework.web.client.HttpStatusCodeException e) {
            HttpHeaders returnedHeaders = new HttpHeaders();
            returnedHeaders.setContentType(org.springframework.http.MediaType.APPLICATION_JSON);
            return ResponseEntity.status(e.getStatusCode())
                                 .headers(returnedHeaders)
                                 .body(e.getResponseBodyAsByteArray());
        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.status(500).build();
        }
    }
}
