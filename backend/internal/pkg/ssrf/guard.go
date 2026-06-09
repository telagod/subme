package ssrf

import (
	"context"
	"net"
	"strings"
	"time"
)

var blockedHosts = map[string]struct{}{
	"localhost":                  {},
	"localhost.localdomain":      {},
	"metadata":                   {},
	"metadata.google.internal":   {},
	"metadata.goog":              {},
	"instance-data":              {},
	"instance-data.ec2.internal": {},
}

var blockedNets = parseCIDRs(
	"127.0.0.0/8",
	"10.0.0.0/8",
	"172.16.0.0/12",
	"192.168.0.0/16",
	"169.254.0.0/16",
	"100.64.0.0/10",
	"0.0.0.0/8",
	"::1/128",
	"fc00::/7",
	"fe80::/10",
	"::/128",
)

func parseCIDRs(cidrs ...string) []*net.IPNet {
	out := make([]*net.IPNet, 0, len(cidrs))
	for _, c := range cidrs {
		_, n, err := net.ParseCIDR(c)
		if err != nil {
			panic("ssrf: bad CIDR: " + c)
		}
		out = append(out, n)
	}
	return out
}

func IsBlockedHost(hostname string) bool {
	if hostname == "" {
		return true
	}
	_, ok := blockedHosts[strings.ToLower(hostname)]
	return ok
}

func IsPrivateIP(ip net.IP) bool {
	if ip == nil {
		return true
	}
	if ip.IsUnspecified() || ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsInterfaceLocalMulticast() {
		return true
	}
	for _, n := range blockedNets {
		if n.Contains(ip) {
			return true
		}
	}
	return false
}

func IsPrivateHost(ctx context.Context, hostname string) (bool, error) {
	if IsBlockedHost(hostname) {
		return true, nil
	}
	if ip := net.ParseIP(hostname); ip != nil {
		return IsPrivateIP(ip), nil
	}
	addrs, err := net.DefaultResolver.LookupIPAddr(ctx, hostname)
	if err != nil {
		return false, err
	}
	if len(addrs) == 0 {
		return true, nil
	}
	for _, a := range addrs {
		if IsPrivateIP(a.IP) {
			return true, nil
		}
	}
	return false, nil
}

func SafeDialContext(dialTimeout, keepAlive time.Duration) func(ctx context.Context, network, address string) (net.Conn, error) {
	d := &net.Dialer{Timeout: dialTimeout, KeepAlive: keepAlive}
	return func(ctx context.Context, network, address string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(address)
		if err != nil {
			return nil, err
		}
		if ip := net.ParseIP(host); ip != nil {
			if IsPrivateIP(ip) {
				return nil, &net.AddrError{Err: "blocked by SSRF policy", Addr: address}
			}
			return d.DialContext(ctx, network, address)
		}
		if IsBlockedHost(host) {
			return nil, &net.AddrError{Err: "blocked by SSRF policy", Addr: address}
		}
		addrs, err := net.DefaultResolver.LookupIPAddr(ctx, host)
		if err != nil {
			return nil, err
		}
		if len(addrs) == 0 {
			return nil, &net.AddrError{Err: "no addresses", Addr: host}
		}
		var lastErr error
		for _, a := range addrs {
			if IsPrivateIP(a.IP) {
				lastErr = &net.AddrError{Err: "blocked by SSRF policy", Addr: a.IP.String()}
				continue
			}
			conn, err := d.DialContext(ctx, network, net.JoinHostPort(a.IP.String(), port))
			if err == nil {
				return conn, nil
			}
			lastErr = err
		}
		if lastErr == nil {
			lastErr = &net.AddrError{Err: "no usable addresses", Addr: host}
		}
		return nil, lastErr
	}
}
